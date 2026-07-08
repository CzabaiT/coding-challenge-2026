import { formatBet } from "./formatBet.js";

export function handleBetPlaced(ctx, msg) {
  ctx.state.applyBetPlaced(msg);
  ctx.betStore?.recordBet({
    gameId: ctx.state.gameId,
    round: ctx.state.roundNumber,
    teamName: msg.teamName,
    playerId: msg.playerId,
    bet: msg.bet,
    isTimeout: msg.isTimeout,
  });
  const tag = msg.isTimeout ? " (timeout)" : "";
  ctx.log.event(`${msg.teamName} bet ${formatBet(msg.bet)}${tag}`);
}
