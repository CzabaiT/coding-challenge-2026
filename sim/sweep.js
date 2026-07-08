import { readFileSync } from "node:fs";

import {
  CompositeStrategy,
  OpeningBetStrategy,
  OpponentAwareDudoStrategy,
} from "../lib/strategy.js";
import { playGame } from "./engine.js";
import { buildOpponentsFromStore } from "./opponentModel.js";

const GAMES = Number(process.env.GAMES ?? 8000);
const US = "MMath";
const store = JSON.parse(
  readFileSync(new URL("../data/opponent-bets.json", import.meta.url), "utf8"),
);
const stats = {
  statsFor: (name) => (store.opponents?.[name] ? { ...store.opponents[name] } : null),
};

function winRate(factory) {
  const opponents = buildOpponentsFromStore(store);
  let wins = 0;
  for (let g = 0; g < GAMES; g++) {
    const seats = opponents.map((op) => ({ name: op.name, strategy: op, isUs: false, dice: [] }));
    seats.splice(g % (seats.length + 1), 0, {
      name: US,
      strategy: factory(),
      isUs: true,
      dice: [],
    });
    const { winner } = playGame({ seats, dicePerPlayer: 5 });
    if (winner === US) wins++;
  }
  return wins / GAMES;
}

const openingFractions = [1 / 2, 1 / 3, 1 / 4, 1 / 5];
const callThresholds = [0.5, 0.45, 0.4, 0.35, 0.3];

console.log(`GAMES=${GAMES}  win% by (openingFraction x callThreshold)\n`);
process.stdout.write("openFrac \\ callThr   ");
console.log(callThresholds.map((c) => c.toFixed(2).padStart(7)).join(""));

for (const frac of openingFractions) {
  const row = callThresholds.map((callThreshold) => {
    const wr = winRate(() =>
      new CompositeStrategy({
        opening: new OpeningBetStrategy({ openingFraction: frac }),
        response: new OpponentAwareDudoStrategy({
          threshold: 0.5,
          callThreshold,
          bluffWeight: 0.4,
          opponents: stats,
        }),
      }),
    );
    return `${(wr * 100).toFixed(1)}`.padStart(7);
  });
  console.log(`1/${Math.round(1 / frac)}`.padStart(18) + "   " + row.join(""));
}
