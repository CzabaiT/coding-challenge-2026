export function handleServerError(ctx, msg) {
  ctx.log.warn("Server error:", msg.message);
  // Before we've authenticated, an error means bad secret / duplicate name.
  // Stop the reconnect loop so we don't hammer the host with bad creds.
  if (!ctx.state.connected) {
    ctx.authFailed = true;
    ctx.log.warn("Treating as auth failure — will not reconnect.");
  }
}
