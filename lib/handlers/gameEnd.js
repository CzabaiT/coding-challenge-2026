export function handleGameEnd(ctx, msg) {
  ctx.state.applyGameEnd();
  ctx.log.event(`Game over — winner: ${msg.winner}`);
  for (const rank of msg.finalRankings ?? []) {
    ctx.log.info(
      `  #${rank.place} ${rank.teamName} — ${rank.diceRemaining} dice left`,
    );
  }
}
