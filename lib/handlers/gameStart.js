export function handleGameStart(ctx, msg) {
  ctx.state.applyGameStart(msg);
  const names = (msg.players ?? []).map((p) => p.teamName).join(", ");
  ctx.log.event(
    `Game ${msg.gameId} — ${msg.players?.length ?? 0} teams [${names}], ` +
      `${msg.dicePerPlayer} dice each, timeout ${msg.turnTimeoutMs}ms (${msg.timeoutAction})`,
  );
}
