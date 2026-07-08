import { formatBet } from "./formatBet.js";

export function handleYourTurn(ctx, msg) {
  ctx.state.applyYourTurn(msg);
  const current = msg.currentBet ? formatBet(msg.currentBet) : "opening";
  ctx.log.event(`My turn — current bet: ${current}`);
  ctx.playTurn();
}
