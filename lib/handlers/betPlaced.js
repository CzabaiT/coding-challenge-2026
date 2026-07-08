import { formatBet } from "./formatBet.js";

export function handleBetPlaced(ctx, msg) {
  ctx.state.applyBetPlaced(msg);
  const tag = msg.isTimeout ? " (timeout)" : "";
  ctx.log.event(`${msg.teamName} bet ${formatBet(msg.bet)}${tag}`);
}
