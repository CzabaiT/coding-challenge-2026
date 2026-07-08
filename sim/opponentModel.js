import {
  countMatching,
  expectedMatches,
  isValidRaise,
  minimumRaise,
  probabilityBetTrue,
} from "../lib/betting.js";
import { Action, MIN_FACE, MAX_FACE, ONE } from "../lib/protocol.js";

/**
 * A data-grounded opponent. Each profile is calibrated from
 * data/opponent-bets.json (bluffRate, avgCount, faceCounts) so simulated play
 * resembles how these teams actually behaved.
 *
 * Behaviour model:
 *   - callThreshold  — challenge when P(current bet true | my dice) < this.
 *   - raiseThreshold — only make an "honest" raise when a safe bid at this
 *                      probability exists.
 *   - bluffProb      — if no safe raise exists but the bet is not challenge-worthy,
 *                      bluff-raise the minimum with this probability (else call).
 *   - facePrefs      — normalized face preference used to shade opening face choice.
 */
export class ProbabilisticOpponent {
  constructor({ name, callThreshold, raiseThreshold, bluffProb, facePrefs, openBias = 0 }) {
    this.name = name;
    this.callThreshold = callThreshold;
    this.raiseThreshold = raiseThreshold;
    this.bluffProb = bluffProb;
    this.facePrefs = facePrefs;
    this.openBias = openBias;
    this.rng = Math.random;
  }

  decide(state) {
    const { myDice, totalDice, currentBet } = state;

    if (!currentBet) {
      return { action: Action.BET, bet: this.#opening(myDice, totalDice) };
    }

    const pTrue = probabilityBetTrue(myDice, currentBet, totalDice);
    if (pTrue < this.callThreshold) {
      return { action: Action.CALL };
    }

    const safe = this.#strongestSafeRaise(myDice, totalDice, currentBet);
    if (safe) return { action: Action.BET, bet: safe };

    // No safe raise. Bluff-raise sometimes; otherwise challenge.
    const raise = minimumRaise(currentBet);
    if (this.rng() < this.bluffProb && isValidRaise(currentBet, raise) && raise.count <= totalDice) {
      return { action: Action.BET, bet: raise };
    }
    return { action: Action.CALL };
  }

  #opening(myDice, totalDice) {
    // Pick a face: usually the best-supported in hand, but shade toward the
    // team's historical favourite faces.
    let value = this.#bestFace(myDice);
    if (this.rng() < 0.35) value = this.#preferredFace();

    const expected = expectedMatches(myDice, value, totalDice);
    // Honest opener ≈ expectation; bluffers push a bit higher.
    const count = Math.max(
      1,
      Math.min(totalDice, Math.round(expected + this.openBias)),
    );
    return { count, value };
  }

  #bestFace(myDice) {
    let best = 2;
    let bestMatch = -1;
    for (let v = 2; v <= MAX_FACE; v++) {
      const m = countMatching(myDice, v);
      if (m > bestMatch) {
        bestMatch = m;
        best = v;
      }
    }
    return best;
  }

  #preferredFace() {
    const r = this.rng();
    let acc = 0;
    for (let v = MIN_FACE; v <= MAX_FACE; v++) {
      acc += this.facePrefs[v] ?? 0;
      if (r <= acc) return v;
    }
    return 2;
  }

  #strongestSafeRaise(dice, totalDice, currentBet) {
    let best = null;
    let bestRank = -1;
    for (let value = MIN_FACE; value <= MAX_FACE; value++) {
      for (let count = 1; count <= totalDice; count++) {
        const claim = { count, value };
        if (!isValidRaise(currentBet, claim)) continue;
        if (probabilityBetTrue(dice, claim, totalDice) < this.raiseThreshold) continue;
        const rank = (value === ONE ? count * 2 : count) * 10 + (value === ONE ? 7 : value);
        if (rank > bestRank) {
          bestRank = rank;
          best = claim;
        }
      }
    }
    return best;
  }
}

/** Normalize a faceCounts map into a probability distribution over faces. */
function faceDistribution(faceCounts) {
  const total = Object.values(faceCounts).reduce((a, b) => a + Number(b), 0) || 1;
  const dist = {};
  for (let v = MIN_FACE; v <= MAX_FACE; v++) {
    dist[v] = (Number(faceCounts[v] ?? 0)) / total;
  }
  return dist;
}

/**
 * Build opponent profiles from the persisted BetStore summary.
 * bluffRate drives how loose they are: heavy bluffers challenge later, raise on
 * thinner ice, and bluff-raise more often.
 */
export function buildOpponentsFromStore(store) {
  const opponents = store.opponents ?? {};
  const profiles = [];

  for (const [name, o] of Object.entries(opponents)) {
    if (o.isSelf) continue; // we plug in our real strategy for our own seat

    const bluffRate = Number(o.bluffRate ?? 0.3);
    // Map bluffRate -> looseness. Honest (~0.15) => tight; extreme (~0.93) => loose.
    const raiseThreshold = clamp(0.5 - 0.42 * bluffRate, 0.1, 0.5);
    const callThreshold = clamp(0.48 - 0.2 * bluffRate, 0.28, 0.48);
    const bluffProb = clamp(bluffRate, 0.05, 0.9);
    // avgCount above the "expectation-ish" baseline hints at aggressive openers.
    const openBias = bluffRate > 0.5 ? 1 : 0;

    profiles.push(
      new ProbabilisticOpponent({
        name,
        callThreshold,
        raiseThreshold,
        bluffProb,
        facePrefs: faceDistribution(o.faceCounts ?? {}),
        openBias,
      }),
    );
  }

  return profiles;
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
