import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_FILE_PATH = "data/opponent-bets.json";
const DEFAULT_FLUSH_DELAY_MS = 250;
const LAST_BETS_CAP = 10;

/**
 * Persists every team's bets to disk in a shape an AI agent can consume:
 * a raw event {@link BetStore#recordBet log} plus per-team
 * {@link BetStore#labelRound summaries} (bluff rate, face preferences, …).
 *
 * Design goals:
 *   - light: native `fs` only, no new dependencies;
 *   - fast: writes are debounced so a burst of `bet_placed` frames costs one
 *     flush, and the flush itself is async;
 *   - safe: a temp-file-then-rename write can never leave half-written JSON,
 *     and every persistence error is swallowed/logged so it can't crash the
 *     agent.
 *
 * Our own bets are tagged via {@link BetStore#self} (`isSelf` on log entries
 * and team summaries).
 */
export class BetStore {
  #filePath;
  #flushDelayMs;
  #log;
  #data;
  #flushTimer = null;
  #flushing = null;

  /**
   * @param {object} [options]
   * @param {string} [options.filePath]     where to persist the store
   * @param {number} [options.flushDelayMs] debounce window for writes
   * @param {{ playerId?: string, teamName?: string }} [options.self] our identity
   * @param {{ warn: Function }} [options.logger] optional error sink
   */
  constructor({
    filePath = DEFAULT_FILE_PATH,
    flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
    self = null,
    logger = null,
  } = {}) {
    this.#filePath = filePath;
    this.#flushDelayMs = flushDelayMs;
    this.#log = logger;
    this.self = self;
    this.#data = { updatedAt: null, log: [], opponents: {} };
    this.#load();
  }

  /** Load an existing store, tolerating a missing or corrupt file. */
  #load() {
    try {
      mkdirSync(dirname(this.#filePath), { recursive: true });
    } catch {
      // best-effort; a failed mkdir will surface again on flush
    }

    try {
      if (!existsSync(this.#filePath)) return;
      const parsed = JSON.parse(readFileSync(this.#filePath, "utf8"));
      this.#data = {
        updatedAt: parsed.updatedAt ?? null,
        log: Array.isArray(parsed.log) ? parsed.log : [],
        opponents:
          parsed.opponents && typeof parsed.opponents === "object"
            ? parsed.opponents
            : {},
      };
    } catch {
      // Missing or corrupt file — start fresh.
      this.#data = { updatedAt: null, log: [], opponents: {} };
    }
  }

  /** True when the given identity is our team. */
  #isSelf(teamName, playerId) {
    const self = this.self;
    if (!self) return false;
    return (
      (self.playerId != null && self.playerId === playerId) ||
      (self.teamName != null && self.teamName === teamName)
    );
  }

  #opponent(teamName, isSelf = false) {
    let opponent = this.#data.opponents[teamName];
    if (!opponent) {
      opponent = {
        teamName,
        isSelf,
        totalBets: 0,
        timeouts: 0,
        bluffsCaught: 0,
        truthsChallenged: 0,
        outcomesKnown: 0,
        bluffRate: 0,
        faceCounts: {},
        avgCount: 0,
        lastBets: [],
      };
      this.#data.opponents[teamName] = opponent;
    } else if (isSelf) {
      opponent.isSelf = true;
    }
    return opponent;
  }

  /**
   * Record a single bet. Appends to the event log with a per-round sequence
   * number and updates the team's running totals, then schedules a debounced
   * flush.
   */
  recordBet({ gameId, round, teamName, playerId, bet, isTimeout = false } = {}) {
    if (!teamName && !playerId) return;

    const isSelf = this.#isSelf(teamName, playerId);
    const count = bet?.count ?? null;
    const value = bet?.value ?? null;
    const at = new Date().toISOString();
    const seq = this.#nextSeq(gameId, round);

    this.#data.log.push({
      gameId: gameId ?? null,
      round: round ?? null,
      seq,
      teamName: teamName ?? null,
      playerId: playerId ?? null,
      isSelf,
      count,
      value,
      isTimeout: !!isTimeout,
      outcome: null,
      at,
    });

    const opponent = this.#opponent(teamName ?? playerId, isSelf);
    opponent.totalBets += 1;
    if (isTimeout) opponent.timeouts += 1;
    if (value != null) {
      opponent.faceCounts[value] = (opponent.faceCounts[value] ?? 0) + 1;
    }
    if (count != null) {
      // Running mean of the declared count over this opponent's bets.
      const prevN = opponent.totalBets - 1;
      opponent.avgCount =
        (opponent.avgCount * prevN + count) / opponent.totalBets;
    }
    opponent.lastBets.push({
      round: round ?? null,
      seq,
      count,
      value,
      isTimeout: !!isTimeout,
      at,
    });
    if (opponent.lastBets.length > LAST_BETS_CAP) {
      opponent.lastBets.splice(0, opponent.lastBets.length - LAST_BETS_CAP);
    }

    this.#scheduleFlush();
  }

  /** Next per-round sequence number for the given game/round. */
  #nextSeq(gameId, round) {
    const gid = gameId ?? null;
    const rnd = round ?? null;
    let max = -1;
    for (const entry of this.#data.log) {
      if (entry.gameId === gid && entry.round === rnd && entry.seq > max) {
        max = entry.seq;
      }
    }
    return max + 1;
  }

  /**
   * Label the bet that ended a round now that its outcome is known, and update
   * the challenged opponent's bluff/truth tallies.
   *
   * `result.betWasCorrect` is from the caller's perspective: when the call was
   * wrong the challenged bet was truthful; when the call was right the
   * challenged bet was a caught bluff.
   */
  labelRound({ gameId, round, result } = {}) {
    const lastBet = result?.lastBet;
    if (!lastBet) return;

    const teamName = lastBet.teamName ?? null;
    const playerId = lastBet.playerId ?? null;
    const bluffCaught = result.betWasCorrect === false;
    const outcome = bluffCaught ? "bluff_caught" : "truth";

    const entry = this.#findBetEntry(gameId, round, teamName, playerId, lastBet.bet);
    if (entry) entry.outcome = outcome;

    if (teamName || playerId) {
      const opponent = this.#opponent(teamName ?? playerId);
      opponent.outcomesKnown += 1;
      if (bluffCaught) opponent.bluffsCaught += 1;
      else opponent.truthsChallenged += 1;
      opponent.bluffRate = opponent.bluffsCaught / opponent.outcomesKnown;
    }

    this.#scheduleFlush();
  }

  /**
   * Read-only snapshot of what we know about an opponent, or null if we've
   * never recorded them. Exposed so opponent-aware strategies can consult a
   * bidder's history (bluff rate, typical count, face preferences) without
   * reaching into private state. `faceCounts` is copied so callers can't mutate
   * the store.
   */
  statsFor(teamName) {
    const opponent = teamName != null ? this.#data.opponents[teamName] : null;
    if (!opponent) return null;
    return {
      teamName: opponent.teamName,
      totalBets: opponent.totalBets,
      timeouts: opponent.timeouts,
      outcomesKnown: opponent.outcomesKnown,
      bluffRate: opponent.bluffRate,
      avgCount: opponent.avgCount,
      faceCounts: { ...opponent.faceCounts },
    };
  }

  /** Find the log entry for a given round's challenged bet (latest match). */
  #findBetEntry(gameId, round, teamName, playerId, bet) {
    const gid = gameId ?? null;
    const rnd = round ?? null;
    for (let i = this.#data.log.length - 1; i >= 0; i--) {
      const entry = this.#data.log[i];
      if (entry.gameId !== gid || entry.round !== rnd) continue;
      if (teamName != null && entry.teamName !== teamName) continue;
      if (teamName == null && playerId != null && entry.playerId !== playerId) {
        continue;
      }
      if (bet) {
        if (entry.count !== (bet.count ?? null)) continue;
        if (entry.value !== (bet.value ?? null)) continue;
      }
      return entry;
    }
    return null;
  }

  #scheduleFlush() {
    if (this.#flushTimer) return;
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      this.#flush();
    }, this.#flushDelayMs);
    // Don't keep the process alive just for a pending flush.
    this.#flushTimer?.unref?.();
  }

  /** Write pretty-printed JSON atomically (temp file then rename). */
  #flush() {
    // Serialize flushes so overlapping writes can't race on the temp file.
    this.#flushing = Promise.resolve(this.#flushing).then(() =>
      this.#writeOnce(),
    );
    return this.#flushing;
  }

  async #writeOnce() {
    this.#data.updatedAt = new Date().toISOString();
    const json = JSON.stringify(this.#data, null, 2);
    const tmp = `${this.#filePath}.${process.pid}.tmp`;
    try {
      await writeFile(tmp, json, "utf8");
      await rename(tmp, this.#filePath);
    } catch (err) {
      this.#log?.warn?.("BetStore flush failed:", err.message);
    }
  }

  /** Force a pending flush to complete (useful for tests / shutdown). */
  async flush() {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }
    await this.#flush();
  }
}
