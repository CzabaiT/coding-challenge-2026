import { readFileSync } from "node:fs";

import {
  CompositeStrategy,
  OpeningBetStrategy,
  OpponentAwareDudoStrategy,
} from "../lib/strategy.js";
import { playGame } from "./engine.js";
import { buildOpponentsFromStore } from "./opponentModel.js";

// Validates the profile-aware challenge logic: how much do we gain from
// reading the standing bidder's (confidence-weighted) bluff profile, and what
// priorStrength best balances early exploitation vs small-sample noise?
const GAMES = Number(process.env.GAMES ?? 4000);
const US = "MMath";

const store = JSON.parse(
  readFileSync(new URL("../data/opponent-bets.json", import.meta.url), "utf8"),
);
const stats = {
  statsFor: (name) => (store.opponents?.[name] ? { ...store.opponents[name] } : null),
};

function winRate(dice, factory) {
  const opponents = buildOpponentsFromStore(store);
  let wins = 0;
  for (let g = 0; g < GAMES; g++) {
    const seats = opponents.map((op) => ({ name: op.name, strategy: op, isUs: false, dice: [] }));
    seats.splice(g % (seats.length + 1), 0, { name: US, strategy: factory(), isUs: true, dice: [] });
    const { winner } = playGame({ seats, dicePerPlayer: dice });
    if (winner === US) wins++;
  }
  return (wins / GAMES) * 100;
}

const mk = ({ bluffWeight, priorStrength }) => () =>
  new CompositeStrategy({
    opening: new OpeningBetStrategy({ openingFraction: 1 / 4 }),
    response: new OpponentAwareDudoStrategy({
      threshold: 0.5,
      callThreshold: 0.4,
      bluffWeight,
      priorStrength,
      raiseStyle: "minimal",
      opponents: stats,
    }),
  });

for (const dice of [5, 20]) {
  console.log(`\n=== DICE/player=${dice} (totalDice≈${dice * 5}), GAMES=${GAMES} ===`);
  // Profile OFF: bluffWeight 0 ignores who bet before us entirely.
  const off = winRate(dice, mk({ bluffWeight: 0, priorStrength: 5 }));
  console.log(`  profile OFF (bluffWeight 0)         win ${off.toFixed(1)}%`);
  for (const priorStrength of [0, 2, 5, 10, 20]) {
    const wr = winRate(dice, mk({ bluffWeight: 0.4, priorStrength }));
    console.log(`  profile ON  priorStrength ${String(priorStrength).padStart(2)}       win ${wr.toFixed(1)}%`);
  }
}
