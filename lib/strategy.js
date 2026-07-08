import { Action, MAX_FACE } from "./protocol.js";
import {
  expectedMatches,
  isValidRaise,
  minimumRaise,
  openingBet,
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
