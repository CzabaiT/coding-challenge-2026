/**
 * Protocol vocabulary for the Roller (Perudo) host.
 *
 * Keeping every wire string in one place means the rest of the codebase never
 * hard-codes a magic string, and adding support for a new message is a
 * one-line change here plus a handler.
 */

/** Messages the server sends to us. */
export const ServerMessage = Object.freeze({
  CONNECTED: "connected",
  ERROR: "error",
  GAME_START: "game_start",
  ROUND_START: "round_start",
  BET_PLACED: "bet_placed",
  YOUR_TURN: "your_turn",
  ROUND_END: "round_end",
  GAME_END: "game_end",
});

/** Messages we send to the server. */
export const ClientMessage = Object.freeze({
  CONNECT: "connect",
  ACTION: "action",
});

/** The two moves available on our turn. */
export const Action = Object.freeze({
  BET: "bet",
  CALL: "call",
});

/** Face values a die can show. `ONE` is the wildcard face. */
export const ONE = 1;
export const MIN_FACE = 1;
export const MAX_FACE = 6;

/** Build the authentication frame sent right after the socket opens. */
export function buildConnect(teamName, secret) {
  return { type: ClientMessage.CONNECT, teamName, secret };
}

/** Build a "raise the bet" frame. */
export function buildBet(bet) {
  return { type: ClientMessage.ACTION, action: Action.BET, bet };
}

/** Build a "challenge the current bet" frame. */
export function buildCall() {
  return { type: ClientMessage.ACTION, action: Action.CALL };
}
