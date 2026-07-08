import WebSocket from "ws";

import { GameState } from "./gameState.js";
import { createLogger } from "./logger.js";
import { defaultStrategy } from "./strategy.js";
import {
  Action,
  ServerMessage,
  buildBet,
  buildCall,
  buildConnect,
} from "./protocol.js";
import { minimumRaise } from "./betting.js";

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Connects to the Roller host, keeps game state in sync, and delegates every
 * turn to a pluggable {@link Strategy}.
 *
 * Resilience:
 *   - every handler and the strategy run inside a try/catch, so one bad frame
 *     can never crash the process or drop the socket;
 *   - reconnects use exponential backoff and stop after an auth error;
 *   - old sockets/timers are torn down before a new connection is made.
 *
 * Extension points:
 *   - `strategy`  — inject any object with a `decide(state)` method.
 *   - `logger`    — inject `{ info, event, warn }` for custom output.
 *   - handler map — the `#handlers` table maps each server message to a method.
 */
export class RollerAgent {
  #host;
  #teamName;
  #secret;
  #strategy;
  #log;

  #ws = null;
  #state = new GameState();
  #reconnectTimer = null;
  #reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  #shouldReconnect = true;
  #authFailed = false;

  constructor({
    host,
    teamName,
    secret,
    strategy = defaultStrategy(),
    logger = createLogger(),
  }) {
    this.#host = host;
    this.#teamName = teamName;
    this.#secret = secret;
    this.#strategy = strategy;
    this.#log = logger;
  }

  /** Expose read-only state (useful for tests and dashboards). */
  get state() {
    return this.#state;
  }

  connect() {
    if (!this.#host) {
      this.#log.warn("No host configured — cannot connect.");
      return;
    }

    // Tear down any previous socket so listeners/timers never stack up.
    this.#teardownSocket();
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;

    const url = `${this.#host}/ws/agent`;
    this.#log.info(`Connecting to ${url} …`);

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.#log.warn("Failed to create socket:", err.message);
      this.#scheduleReconnect();
      return;
    }

    this.#ws = ws;
    ws.on("open", () => this.#onOpen());
    ws.on("message", (data) => this.#safe("message", () => this.#onMessage(data)));
    ws.on("close", (code, reason) => this.#onClose(code, reason));
    ws.on("error", (err) => this.#log.warn("Socket error:", err.message));
  }

  disconnect() {
    this.#shouldReconnect = false;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#teardownSocket();
  }

  // --- Socket lifecycle -----------------------------------------------------

  #onOpen() {
    this.#log.info("Socket open — authenticating …");
    // A successful open resets backoff; auth success is confirmed separately.
    this.#reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this.#send(buildConnect(this.#teamName, this.#secret));
  }

  #onClose(code, reason) {
    this.#state.connected = false;
    const reasonText = reason?.toString() || "none";
    this.#log.warn(`Socket closed (code=${code}, reason=${reasonText})`);

    if (this.#authFailed) {
      this.#log.warn("Not reconnecting: authentication failed.");
      return;
    }
    this.#scheduleReconnect();
  }

  #scheduleReconnect() {
    if (!this.#shouldReconnect || this.#reconnectTimer) return;

    const delay = this.#reconnectDelay;
    this.#log.info(`Reconnecting in ${delay}ms …`);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.connect();
    }, delay);

    // Exponential backoff, capped, so a persistent failure won't hot-loop.
    this.#reconnectDelay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
  }

  #teardownSocket() {
    if (!this.#ws) return;
    this.#ws.removeAllListeners();
    try {
      this.#ws.close();
    } catch {
      // already closing/closed — nothing to do
    }
    this.#ws = null;
  }

  #send(payload) {
    if (this.#ws?.readyState !== WebSocket.OPEN) {
      this.#log.warn("Dropping outbound frame — socket not open:", payload.type);
      return;
    }
    try {
      this.#ws.send(JSON.stringify(payload));
    } catch (err) {
      this.#log.warn("Failed to send frame:", err.message);
    }
  }

  /** Run a handler, converting any throw into a log instead of a crash. */
  #safe(label, fn) {
    try {
      fn();
    } catch (err) {
      this.#log.warn(`Error handling ${label}:`, err.message);
    }
  }

  // --- Message routing ------------------------------------------------------

  /** Map each server message type to its handler method. */
  get #handlers() {
    return {
      [ServerMessage.CONNECTED]: this.#onConnected,
      [ServerMessage.ERROR]: this.#onServerError,
      [ServerMessage.GAME_START]: this.#onGameStart,
      [ServerMessage.ROUND_START]: this.#onRoundStart,
      [ServerMessage.BET_PLACED]: this.#onBetPlaced,
      [ServerMessage.YOUR_TURN]: this.#onYourTurn,
      [ServerMessage.ROUND_END]: this.#onRoundEnd,
      [ServerMessage.GAME_END]: this.#onGameEnd,
    };
  }

  #onMessage(data) {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      this.#log.warn("Ignoring non-JSON frame:", data.toString());
      return;
    }

    if (!msg || typeof msg.type !== "string") {
      this.#log.warn("Ignoring frame without a type:", msg);
      return;
    }

    const handler = this.#handlers[msg.type];
    if (handler) {
      handler.call(this, msg);
    } else {
      this.#log.warn("Unhandled message type:", msg.type);
    }
  }

  // --- Server message handlers ---------------------------------------------

  #onConnected(msg) {
    this.#authFailed = false;
    this.#reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    this.#state.applyConnected(msg);
    this.#log.event(`Connected as ${msg.teamName} (${msg.playerId})`);
  }

  #onServerError(msg) {
    this.#log.warn("Server error:", msg.message);
    // Before we've authenticated, an error means bad secret / duplicate name.
    // Stop the reconnect loop so we don't hammer the host with bad creds.
    if (!this.#state.connected) {
      this.#authFailed = true;
      this.#log.warn("Treating as auth failure — will not reconnect.");
    }
  }

  #onGameStart(msg) {
    this.#state.applyGameStart(msg);
    const names = (msg.players ?? []).map((p) => p.teamName).join(", ");
    this.#log.event(
      `Game ${msg.gameId} — ${msg.players?.length ?? 0} teams [${names}], ` +
        `${msg.dicePerPlayer} dice each, timeout ${msg.turnTimeoutMs}ms (${msg.timeoutAction})`,
    );
  }

  #onRoundStart(msg) {
    this.#state.applyRoundStart(msg);
    const dice = (msg.yourDice ?? []).join(", ");
    this.#log.event(
      `Round ${msg.roundNumber} — my dice [${dice}], ` +
        `table ${JSON.stringify(msg.playerDiceCounts ?? {})}`,
    );
  }

  #onBetPlaced(msg) {
    this.#state.applyBetPlaced(msg);
    const tag = msg.isTimeout ? " (timeout)" : "";
    this.#log.event(`${msg.teamName} bet ${formatBet(msg.bet)}${tag}`);
  }

  #onYourTurn(msg) {
    this.#state.applyYourTurn(msg);
    const current = msg.currentBet ? formatBet(msg.currentBet) : "opening";
    this.#log.event(`My turn — current bet: ${current}`);
    this.#playTurn();
  }

  #onRoundEnd(msg) {
    const result = msg.result ?? {};
    this.#state.applyRoundEnd(msg);

    const reason = result.betWasCorrect
      ? `${result.calledBy?.teamName ?? "?"} called a true bet`
      : `${result.lastBet?.teamName ?? "?"} was caught bluffing`;
    this.#log.event(
      `Round ${result.roundNumber} over — ${reason}; ` +
        `actual ${result.actualCount}, ${result.loser?.teamName ?? "?"} loses a die`,
    );

    if (result.eliminatedId) {
      this.#log.event(`Eliminated: ${this.#state.teamNameFor(result.eliminatedId)}`);
    }
  }

  #onGameEnd(msg) {
    this.#state.applyGameEnd();
    this.#log.event(`Game over — winner: ${msg.winner}`);
    for (const rank of msg.finalRankings ?? []) {
      this.#log.info(
        `  #${rank.place} ${rank.teamName} — ${rank.diceRemaining} dice left`,
      );
    }
  }

  // --- Acting ---------------------------------------------------------------

  /**
   * Ask the strategy for a move and send it. If the strategy throws or returns
   * something invalid, fall back to a safe legal move so we never waste a turn.
   */
  #playTurn() {
    let decision;
    try {
      decision = this.#strategy.decide(this.#state);
    } catch (err) {
      this.#log.warn("Strategy threw — using fallback:", err.message);
    }

    decision = this.#normalizeDecision(decision);

    if (decision.action === Action.CALL) {
      this.#log.info("Decision: call");
      this.#send(buildCall());
      return;
    }
    this.#log.info(`Decision: bet ${formatBet(decision.bet)}`);
    this.#send(buildBet(decision.bet));
  }

  /** Coerce a strategy result into a valid action, or a safe fallback. */
  #normalizeDecision(decision) {
    const canCall = this.#state.currentBet != null;

    if (decision?.action === Action.CALL && canCall) {
      return decision;
    }
    if (
      decision?.action === Action.BET &&
      decision.bet &&
      Number.isInteger(decision.bet.count) &&
      Number.isInteger(decision.bet.value)
    ) {
      return decision;
    }

    // Fallback: call if we legally can, otherwise the minimum legal raise.
    return canCall
      ? { action: Action.CALL }
      : { action: Action.BET, bet: minimumRaise(this.#state.currentBet) };
  }
}

function formatBet(bet) {
  if (!bet) return "?";
  return `${bet.count}×${bet.value}`;
}
