/**
 * A tiny leveled logger. Swap it out (or pass `{ logger }` to the agent) if you
 * want JSON logs, a file sink, or silence during tests.
 */
export function createLogger(prefix = "roller") {
  const stamp = () => new Date().toISOString().slice(11, 19); // HH:MM:SS
  const line = (level, args) =>
    console.log(`[${stamp()}] ${prefix} ${level}`, ...args);

  return {
    info: (...args) => line("·", args),
    event: (...args) => line("→", args),
    warn: (...args) => line("!", args),
  };
}
