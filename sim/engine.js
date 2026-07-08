import { countMatching, isValidRaise, minimumRaise } from "../lib/betting.js";
import { Action } from "../lib/protocol.js";

const rollDie = () => 1 + Math.floor(Math.random() * 6);

/**
 * A minimal but faithful Perudo engine that reuses the project's own betting
 * rules (isValidRaise / countMatching / minimumRaise) so simulated resolution
 * matches what the real host would do.
 *
 * Each seat: { name, dice: number[], strategy: { decide(view) }, isUs }.
 * A `view` given to strategies mirrors the fields GameState exposes:
 *   { myDice, totalDice, currentBet, roundBets }.
 */
export function playGame({ seats, dicePerPlayer = 5, diag }) {
  for (const s of seats) s.dice = Array.from({ length: dicePerPlayer }, rollDie);

  let starter = Math.floor(Math.random() * seats.length);
  let round = 0;
  const alive = () => seats.filter((s) => s.dice.length > 0);

  while (alive().length > 1) {
    round += 1;
    // Re-roll everyone's remaining dice at the start of each round.
    for (const s of seats) s.dice = s.dice.map(rollDie);

    const outcome = playRound({ seats, starter, diag, round });
    starter = nextAliveIndex(seats, outcome.nextStarterIndex);
  }

  const winner = alive()[0] ?? null;
  return { winner: winner?.name ?? null, rounds: round };
}

function playRound({ seats, starter, diag, round }) {
  const active = () => seats.filter((s) => s.dice.length > 0);
  const totalDice = () => active().reduce((n, s) => n + s.dice.length, 0);

  let currentBet = null;
  const roundBets = [];
  let bidderIndex = null;
  let openerName = null;

  let idx = starter;
  // Ensure starter is alive.
  if (seats[idx].dice.length === 0) idx = nextAliveIndex(seats, idx);

  // Safety cap on turns to avoid any pathological loop.
  for (let guard = 0; guard < 10_000; guard++) {
    const player = seats[idx];
    const view = {
      myDice: player.dice,
      totalDice: totalDice(),
      currentBet,
      roundBets: roundBets.map((b) => ({ ...b })),
    };

    let decision = safeDecide(player, view);
    decision = normalize(decision, currentBet, view.totalDice, player.isUs);

    if (decision.action === Action.CALL) {
      // Resolve challenge: `player` challenges `bidderIndex`'s currentBet.
      const bidder = seats[bidderIndex];
      const actual = active().reduce(
        (n, s) => n + countMatching(s.dice, currentBet.value),
        0,
      );
      const betTrue = actual >= currentBet.count;
      const loser = betTrue ? player : bidder;
      loser.dice.pop();

      if (diag) {
        diag.onRoundEnd({
          round,
          currentBet,
          actual,
          betTrue,
          bidderName: bidder.name,
          callerName: player.name,
          openerName,
          openerWasBidder: bidder.name === openerName,
          loserName: loser.name,
          loserIsUs: loser.isUs,
          bidderIsUs: bidder.isUs,
          callerIsUs: player.isUs,
        });
      }

      // Loser starts next round; if eliminated, seat still returned and the
      // caller resolves to the next alive seat.
      return { nextStarterIndex: seats.indexOf(loser) };
    }

    // A bet.
    if (currentBet === null) openerName = player.name;
    currentBet = decision.bet;
    roundBets.push({ teamName: player.name, playerId: player.name, bet: decision.bet });
    bidderIndex = idx;
    idx = nextAliveIndex(seats, idx);
  }

  // Should never happen; fall back to starter.
  return { nextStarterIndex: starter };
}

function safeDecide(player, view) {
  try {
    return player.strategy.decide(view);
  } catch {
    return null;
  }
}

/**
 * Mirror the agent's own normalization: a call is only legal when a bet stands;
 * an invalid/absent bet falls back to a call (if possible) or the minimum raise.
 */
function normalize(decision, currentBet, totalDice, _isUs) {
  const canCall = currentBet != null;

  if (decision?.action === Action.CALL && canCall) return decision;

  if (
    decision?.action === Action.BET &&
    decision.bet &&
    Number.isInteger(decision.bet.count) &&
    Number.isInteger(decision.bet.value) &&
    isValidRaise(currentBet, decision.bet) &&
    decision.bet.count <= totalDice
  ) {
    return decision;
  }

  if (canCall) return { action: Action.CALL };

  const raise = minimumRaise(currentBet);
  return { action: Action.BET, bet: raise };
}

function nextAliveIndex(seats, fromIdx) {
  const n = seats.length;
  for (let step = 1; step <= n; step++) {
    const i = (fromIdx + step) % n;
    if (seats[i].dice.length > 0) return i;
  }
  return fromIdx;
}
