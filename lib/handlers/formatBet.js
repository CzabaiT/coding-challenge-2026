/** Format a `(count, value)` bet for logging. */
export function formatBet(bet) {
  if (!bet) return "?";
  return `${bet.count}×${bet.value}`;
}
