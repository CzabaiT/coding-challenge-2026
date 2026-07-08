import { Action, ONE, MAX_FACE, MIN_FACE } from "./protocol.js";
import {
  expectedMatches,
  isValidRaise,
  minimumRaise,
  openingBet,
  probabilityBetTrue,
} from "./betting.js";

/**
 * A decision returned by a strategy. Either:
 *   { action: "call" }
 *   { action: "bet", bet: { count, value } }
 */

/**
 * Base class describing the strategy contract. Subclass it and override
 * `decide(state)` to plug in your own bot without touching the agent or the
 * networking layer.
 */
export class Strategy {
  /**
   * @param {import("./gameState.js").GameState} _state
   * @returns {{ action: string, bet?: { count: number, value: number } }}
   */
  decide(_state) {
    throw new Error("Strategy.decide() must be implemented by a subclass");
  }
}

/**
 * Default strategy: bets on expected value and only calls when the current
 * bet clearly exceeds what the table is statistically likely to hold.
 *
 * Tuning knobs are constructor options so you can create variants without
 * copy-pasting logic:
 *   - callMargin        how far a bet must exceed expectation before we call
 *   - onesCallMargin    the same, but for the riskier wild-face bets
 *   - openingFraction   share of table dice to claim on the opening bet
 */
export class ProbabilityStrategy extends Strategy {
  constructor({
    callMargin = 1.0,
    onesCallMargin = 0.75,
    openingFraction = 1 / 3,
  } = {}) {
    super();
    this.callMargin = callMargin;
    this.onesCallMargin = onesCallMargin;
    this.openingFraction = openingFraction;
  }

  decide(state) {
    const { myDice, totalDice, currentBet } = state;

    if (!currentBet) {
      return {
        action: Action.BET,
        bet: openingBet(myDice, totalDice, { fraction: this.openingFraction }),
      };
    }

    if (this.#betLooksTooHigh(myDice, totalDice, currentBet)) {
      return { action: Action.CALL };
    }

    const raise = minimumRaise(currentBet);
    return isValidRaise(currentBet, raise)
      ? { action: Action.BET, bet: raise }
      : { action: Action.CALL };
  }

  /** True when the claimed count is implausibly higher than expectation. */
  #betLooksTooHigh(dice, totalDice, bet) {
    const expected = expectedMatches(dice, bet.value, totalDice);
    const margin = bet.value === 1 ? this.onesCallMargin : this.callMargin;
    return bet.count > expected + margin;
  }
}

/**
 * Only ever bets on sixes, and never claims more than a fixed fraction
 * (default 1/3) of the dice currently in play. `totalDice` comes from summing
 * `playerDiceCounts` at round_start, so the cap shrinks as teams lose dice.
 *
 * On each turn it plays the smallest sixes bet that legally beats the current
 * bet; if that would exceed the cap, it calls instead.
 */
export class CappedSixesStrategy extends Strategy {
  constructor({ fraction = 1 / 3, value = MAX_FACE } = {}) {
    super();
    this.fraction = fraction;
    this.value = value;
  }

  decide(state) {
    const { totalDice, currentBet } = state;
    const cap = Math.max(1, Math.floor(totalDice * this.fraction));
    const needed = this.#minCountToBeat(currentBet);

    if (needed <= cap) {
      return { action: Action.BET, bet: { count: needed, value: this.value } };
    }

    // A legal raise would exceed the cap: challenge instead (or make the
    // largest allowed opening bet if we're first to act).
    return currentBet
      ? { action: Action.CALL }
      : { action: Action.BET, bet: { count: cap, value: this.value } };
  }

  /** Smallest count for a `this.value` bet that strictly beats `currentBet`. */
  #minCountToBeat(currentBet) {
    if (!currentBet) return 1;
    if (currentBet.value === 1) {
      return currentBet.count * 2; // ones → non-ones doubles the threshold
    }
    // non-ones → non-ones: same count wins if our face is higher.
    return currentBet.value < this.value
      ? currentBet.count
      : currentBet.count + 1;
  }
}

/**
 * Opening-focused strategy: the first bet of a round comes straight from the
 * hand-aware {@link openingBet} helper (best-supported face at a fraction of
 * the table). Follow-up turns use the same probability model as
 * {@link ProbabilityStrategy} — call when a bet clearly beats expectation,
 * otherwise make the minimum legal raise.
 *
 * Kept as its own class so the opening logic can be tuned independently of the
 * other strategies.
 */
export class OpeningBetStrategy extends Strategy {
  constructor({
    openingFraction = 1 / 3,
    callMargin = 1.0,
    onesCallMargin = 0.75,
  } = {}) {
    super();
    this.openingFraction = openingFraction;
    this.callMargin = callMargin;
    this.onesCallMargin = onesCallMargin;
  }

  decide(state) {
    const { myDice, totalDice, currentBet } = state;

    if (!currentBet) {
      return {
        action: Action.BET,
        bet: openingBet(myDice, totalDice, { fraction: this.openingFraction }),
      };
    }

    const expected = expectedMatches(myDice, currentBet.value, totalDice);
    const margin = currentBet.value === 1 ? this.onesCallMargin : this.callMargin;
    if (currentBet.count > expected + margin) {
      return { action: Action.CALL };
    }

    const raise = minimumRaise(currentBet);
    return isValidRaise(currentBet, raise)
      ? { action: Action.BET, bet: raise }
      : { action: Action.CALL };
  }
}

/**
 * "SimpleDudoPlayer" — the canonical Dudo/Perudo baseline described by Todd
 * Neller (Gettysburg College) and reused by most probability-based bots:
 *
 *   Make the strongest legal bid that is still correct with probability ≥ ½
 *   (binomial tail conditioned on our own dice). If no such bid exists, call.
 *
 * Simple, fast, and hard to punish: it only ever raises into bids it expects to
 * survive, and challenges once the table can no longer support a safe raise.
 *
 * Reference: http://cs.gettysburg.edu/~tneller/papers/talks/101104DudoItYourself.pdf
 */
export class SimpleDudoStrategy extends Strategy {
  constructor({ threshold = 0.5 } = {}) {
    super();
    this.threshold = threshold;
  }

  decide(state) {
    const { myDice, totalDice, currentBet } = state;
    const claim = strongestSafeClaim(myDice, totalDice, currentBet, this.threshold);

    if (claim) {
      return { action: Action.BET, bet: claim };
    }
    // No bid clears the probability bar → challenge (or open minimally if we
    // somehow have no bet to challenge).
    return currentBet
      ? { action: Action.CALL }
      : { action: Action.BET, bet: minimumRaise(null) };
  }
}

/**
 * "OpponentAwareDudoStrategy" — SimpleDudo with a memory. It still only raises
 * into bids it expects to survive (binomial tail ≥ `threshold`), but it decides
 * *when to challenge* using the standing bidder's recorded history rather than
 * probability alone.
 *
 * The intuition from our game logs: some teams bluff almost every time they're
 * challenged (e.g. Bot-A ~0.93) while others almost never do (e.g. Super Agent
 * ~0.15). Against a habitual bluffer we should pull the trigger on thinner
 * evidence; against an honest bidder we should give them more rope.
 *
 * `opponents` is any object exposing `statsFor(teamName) -> { bluffRate,
 * outcomesKnown, ... } | null` (the {@link BetStore} satisfies this). When no
 * history is available it degrades gracefully to plain SimpleDudo behaviour.
 */
export class OpponentAwareDudoStrategy extends Strategy {
  constructor({
    threshold = 0.5,
    callThreshold = 0.5,
    bluffWeight = 0.4,
    minOutcomes = 3,
    raiseStyle = "minimal",
    opponents = null,
  } = {}) {
    super();
    this.threshold = threshold;
    this.callThreshold = callThreshold;
    this.bluffWeight = bluffWeight;
    this.minOutcomes = minOutcomes;
    // "minimal"  → raise as little as legally needed while staying safe, which
    //              avoids leaping to the distribution mean (a coin flip) in
    //              large-dice games and keeps our options open.
    // "strongest" → classic SimpleDudo: bid the highest safe claim.
    this.raiseStyle = raiseStyle;
    this.opponents = opponents;
  }

  decide(state) {
    const { myDice, totalDice, currentBet } = state;

    if (!currentBet) {
      return { action: Action.BET, bet: minimumRaise(null) };
    }

    // Challenge early when the standing bet already looks unlikely *and* the
    // bidder has a track record of bluffing.
    const pTrue = probabilityBetTrue(myDice, currentBet, totalDice);
    if (pTrue < this.#callBar(state)) {
      return { action: Action.CALL };
    }

    // Otherwise raise to a bid we still expect to survive, or call if none
    // qualifies. `minimal` keeps us off the coin-flip edge; `strongest` maxes.
    const claim =
      this.raiseStyle === "strongest"
        ? strongestSafeClaim(myDice, totalDice, currentBet, this.threshold)
        : minimalSafeClaim(myDice, totalDice, currentBet, this.threshold);
    return claim
      ? { action: Action.BET, bet: claim }
      : { action: Action.CALL };
  }

  /**
   * How improbable the standing bet must look before we challenge. The base bar
   * is `callThreshold`; a bidder who bluffs more than average nudges it up (we
   * call sooner), an honest bidder nudges it down. We only trust a bluff rate
   * once we've seen at least `minOutcomes` resolved rounds for that team.
   */
  #callBar(state) {
    const stats = this.#lastBidderStats(state);
    if (!stats || stats.outcomesKnown < this.minOutcomes) {
      return this.callThreshold;
    }
    const bar = this.callThreshold + this.bluffWeight * (stats.bluffRate - 0.5);
    return Math.min(0.95, Math.max(0.05, bar));
  }

  /** Stats for whoever made the bet we're now responding to, or null. */
  #lastBidderStats(state) {
    if (typeof this.opponents?.statsFor !== "function") return null;
    const bets = state.roundBets;
    const last = bets?.[bets.length - 1];
    if (!last) return null;
    return this.opponents.statsFor(last.teamName ?? last.playerId);
  }
}

/**
 * Highest-ranked legal raise over `currentBet` whose probability of being true
 * (conditioned on our own `dice`) is at least `threshold`, or null if none
 * qualifies. A claim can't exceed the dice on the table, so counts are capped
 * at `totalDice`.
 */
function strongestSafeClaim(dice, totalDice, currentBet, threshold) {
  let best = null;
  let bestRank = -1;

  for (let value = MIN_FACE; value <= MAX_FACE; value++) {
    for (let count = 1; count <= totalDice; count++) {
      const claim = { count, value };
      if (!isValidRaise(currentBet, claim)) continue;
      if (probabilityBetTrue(dice, claim, totalDice) < threshold) continue;

      const rank = bidRank(claim);
      if (rank > bestRank) {
        bestRank = rank;
        best = claim;
      }
    }
  }

  return best;
}

/**
 * Lowest-ranked legal raise over `currentBet` whose probability of being true
 * (conditioned on our own `dice`) is at least `threshold`, or null if none
 * qualifies. Unlike {@link strongestSafeClaim}, this makes the *smallest* safe
 * step, so we never volunteer a jump to the distribution mean — critical in
 * large-dice games where "bid the mean" is a coin flip the table can call.
 */
function minimalSafeClaim(dice, totalDice, currentBet, threshold) {
  let best = null;
  let bestRank = Infinity;

  for (let value = MIN_FACE; value <= MAX_FACE; value++) {
    for (let count = 1; count <= totalDice; count++) {
      const claim = { count, value };
      if (!isValidRaise(currentBet, claim)) continue;
      if (probabilityBetTrue(dice, claim, totalDice) < threshold) continue;

      const rank = bidRank(claim);
      if (rank < bestRank) {
        bestRank = rank;
        best = claim;
      }
    }
  }

  return best;
}

/**
 * A scalar bid strength for picking the "strongest" safe claim. Ones are worth
 * roughly double (they raise the effective count), matching the raise rules;
 * face value is a minor tie-breaker.
 */
function bidRank(bet) {
  const effectiveCount = bet.value === ONE ? bet.count * 2 : bet.count;
  const faceRank = bet.value === ONE ? MAX_FACE + 1 : bet.value;
  return effectiveCount * 10 + faceRank;
}

/**
 * Delegates to one of two strategies depending on the turn:
 *   - `opening`  — used when there is no current bet (we open the round).
 *   - `response` — used when a bet already exists (another team has bet), so we
 *                  must call or raise.
 *
 * This lets you tune opening play and reactive play completely independently.
 */
export class CompositeStrategy extends Strategy {
  constructor({ opening, response }) {
    super();
    if (!opening || typeof opening.decide !== "function") {
      throw new Error("CompositeStrategy requires an `opening` strategy");
    }
    if (!response || typeof response.decide !== "function") {
      throw new Error("CompositeStrategy requires a `response` strategy");
    }
    this.opening = opening;
    this.response = response;
  }

  decide(state) {
    const strategy = state.currentBet ? this.response : this.opening;
    return strategy.decide(state);
  }
}

/** The strategy used when the caller doesn't supply one. */
export function defaultStrategy() {
  return new CompositeStrategy({
    opening: new OpeningBetStrategy(),
    response: new ProbabilityStrategy(),
  });
}
