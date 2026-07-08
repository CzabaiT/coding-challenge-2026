import { ONE, MAX_FACE } from "./protocol.js";

/**
 * Pure Perudo betting rules. Nothing here talks to the network or holds state,
 * so each function can be unit-tested and reused by any strategy.
 *
 * A "bet" is `{ count, value }`:
 *   - `count` — how many dice across the whole table show `value`
 *   - `value` — the face being claimed (1–6)
 *
 * Ones are wild: they count toward any non-ones bet. A bet on ones counts
 * only actual ones.
 */

const isWildFace = (value) => value === ONE;

/**
 * How many of my dice support a bet on `value`.
 * Ones count toward non-ones bets; a ones bet counts only ones.
 */
export function countMatching(dice, value) {
  return dice.filter((die) =>
    isWildFace(value) ? die === ONE : die === value || die === ONE,
  ).length;
}

/**
 * Probability that a single unknown die supports a bet on `value`.
 * Ones bet: only a rolled 1 helps (1/6).
 * Non-ones bet: the face itself or a wild 1 helps (2/6 = 1/3).
 */
export function matchProbability(value) {
  return isWildFace(value) ? 1 / 6 : 1 / 3;
}

/**
 * Expected total matching dice on the table: the ones I can see for certain
 * plus the statistical expectation over everyone else's hidden dice.
 */
export function expectedMatches(dice, value, totalDice) {
  const known = countMatching(dice, value);
  const hidden = totalDice - dice.length;
  return known + hidden * matchProbability(value);
}

/**
 * Is `next` a strictly higher (legal) raise over `current`?
 * `current` is null on the opening bet, where any well-formed bet is legal.
 *
 * The four transitions mirror the protocol's raise table, because ones are
 * "worth double" — switching to/from the wild face changes the threshold.
 */
export function isValidRaise(current, next) {
  if (!isWellFormed(next)) return false;
  if (!current) return true;

  const toOnes = isWildFace(next.value);
  const fromOnes = isWildFace(current.value);

  if (!fromOnes && !toOnes) {
    return (
      next.count > current.count ||
      (next.count === current.count && next.value > current.value)
    );
  }
  if (!fromOnes && toOnes) {
    return next.count * 2 > current.count;
  }
  if (fromOnes && toOnes) {
    return next.count > current.count;
  }
  return next.count >= current.count * 2; // ones → non-ones
}

/**
 * The smallest legal raise over `current`, or the smallest opening bet when
 * `current` is null. Handy as a safe fallback for any strategy.
 */
export function minimumRaise(current) {
  if (!current) {
    return { count: 1, value: 2 };
  }

  if (!isWildFace(current.value)) {
    return current.value < MAX_FACE
      ? { count: current.count, value: current.value + 1 }
      : { count: current.count + 1, value: ONE };
  }

  const doubled = current.count * 2;
  return doubled <= MAX_FACE
    ? { count: doubled, value: 2 }
    : { count: current.count + 1, value: ONE };
}

function isWellFormed(bet) {
  return (
    !!bet &&
    Number.isInteger(bet.count) &&
    Number.isInteger(bet.value) &&
    bet.count >= 1 &&
    bet.value >= 1 &&
    bet.value <= MAX_FACE
  );
}
