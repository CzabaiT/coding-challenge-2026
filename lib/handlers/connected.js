export function handleConnected(ctx, msg) {
  ctx.authFailed = false;
  ctx.resetReconnectDelay();
  ctx.state.applyConnected(msg);
  ctx.log.event(`Connected as ${msg.teamName} (${msg.playerId})`);
}
