export function handleRoundEnd(ctx, msg) {
  const result = msg.result ?? {};
  ctx.state.applyRoundEnd(msg);

  const reason = result.betWasCorrect
    ? `${result.calledBy?.teamName ?? "?"} called a true bet`
    : `${result.lastBet?.teamName ?? "?"} was caught bluffing`;
  ctx.log.event(
    `Round ${result.roundNumber} over — ${reason}; ` +
      `actual ${result.actualCount}, ${result.loser?.teamName ?? "?"} loses a die`,
  );

  if (result.eliminatedId) {
    ctx.log.event(`Eliminated: ${ctx.state.teamNameFor(result.eliminatedId)}`);
  }
}
