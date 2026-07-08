import { ServerMessage } from "../protocol.js";
import { handleBetPlaced } from "./betPlaced.js";
import { handleConnected } from "./connected.js";
import { handleServerError } from "./error.js";
import { handleGameEnd } from "./gameEnd.js";
import { handleGameStart } from "./gameStart.js";
import { handleRoundEnd } from "./roundEnd.js";
import { handleRoundStart } from "./roundStart.js";
import { handleYourTurn } from "./yourTurn.js";

/** Map each server message type to its handler. */
export const handlers = Object.freeze({
  [ServerMessage.CONNECTED]: handleConnected,
  [ServerMessage.ERROR]: handleServerError,
  [ServerMessage.GAME_START]: handleGameStart,
  [ServerMessage.ROUND_START]: handleRoundStart,
  [ServerMessage.BET_PLACED]: handleBetPlaced,
  [ServerMessage.YOUR_TURN]: handleYourTurn,
  [ServerMessage.ROUND_END]: handleRoundEnd,
  [ServerMessage.GAME_END]: handleGameEnd,
});
