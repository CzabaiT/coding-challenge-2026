export function handleRoundStart(ctx, msg) {
  ctx.state.applyRoundStart(msg);
  const dice = (msg.yourDice ?? []).join(", ");
  ctx.log.event(
    `Round ${msg.roundNumber} — my dice [${dice}], ` +
      `table ${JSON.stringify(msg.playerDiceCounts ?? {})}`,
  );
}
