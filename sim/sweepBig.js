import { readFileSync } from "node:fs";

import {
  CompositeStrategy,
  OpeningBetStrategy,
  OpponentAwareDudoStrategy,
} from "../lib/strategy.js";
import { playGame } from "./engine.js";
import { buildOpponentsFromStore } from "./opponentModel.js";

// Large-dice regime, matching the fresh game (~100+ dice/player). We use 20
// dice/player (100 on table) to preserve the large-N binomial dynamics — where
// "bid at the mean" is a coin flip — while staying fast.
const GAMES = Number(process.env.GAMES ?? 3000);
const DICE = Number(process.env.DICE ?? 20);
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
  const diag = { bidderLoss: 0, callerLoss: 0, challenges: 0, misfire: 0 };
  const d = {
    onRoundEnd(e) {
      if (e.loserIsUs && e.bidderIsUs && !e.betTrue) diag.bidderLoss++;
      if (e.loserIsUs && e.callerIsUs && e.betTrue) diag.callerLoss++;
      if (e.callerIsUs) {
        diag.challenges++;
        if (e.betTrue) diag.misfire++;
      }
    },
  };
  for (let g = 0; g < GAMES; g++) {
    const seats = opponents.map((op) => ({ name: op.name, strategy: op, isUs: false, dice: [] }));
    seats.splice(g % (seats.length + 1), 0, { name: US, strategy: factory(), isUs: true, dice: [] });
    const { winner } = playGame({ seats, dicePerPlayer: DICE, diag: d });
    if (winner === US) wins++;
  }
  return { wr: wins / GAMES, ...diag };
}

function mk({ openingFraction, threshold, callThreshold }) {
  return () =>
    new CompositeStrategy({
      opening: new OpeningBetStrategy({ openingFraction }),
      response: new OpponentAwareDudoStrategy({
        threshold,
        callThreshold,
        bluffWeight: 0.4,
        opponents: stats,
      }),
    });
}

console.log(`GAMES=${GAMES}  DICE/player=${DICE}  (totalDice=${DICE * 5})\n`);

// 1) Current config baseline.
const base = winRate(mk({ openingFraction: 1 / 3, threshold: 0.5, callThreshold: 0.5 }));
console.log(
  `CURRENT (openFrac 1/3, bidThreshold 0.5, callThreshold 0.5): win ${(base.wr * 100).toFixed(1)}%  ` +
    `| dieLoss bidder=${base.bidderLoss} caller=${base.callerLoss} | challenge misfire ${((base.misfire / base.challenges) * 100).toFixed(0)}%`,
);

// 2) Sweep our bid-safety threshold (how safe our own standing bets must be).
console.log(`\nbid-safety threshold sweep (openFrac 1/4, callThreshold 0.4):`);
for (const threshold of [0.5, 0.6, 0.7, 0.8]) {
  const r = winRate(mk({ openingFraction: 1 / 4, threshold, callThreshold: 0.4 }));
  console.log(
    `  threshold ${threshold.toFixed(2)}: win ${(r.wr * 100).toFixed(1)}%  ` +
      `| dieLoss bidder=${r.bidderLoss} caller=${r.callerLoss} | misfire ${((r.misfire / r.challenges) * 100).toFixed(0)}%`,
  );
}

// 3) Joint sweep of the two biggest levers at a safer opening.
console.log(`\njoint sweep win% (rows=bidThreshold, cols=callThreshold), openFrac 1/4:`);
const calls = [0.5, 0.45, 0.4, 0.35];
console.log("  bidThr\\callThr " + calls.map((c) => c.toFixed(2).padStart(7)).join(""));
for (const threshold of [0.5, 0.65, 0.75]) {
  const row = calls.map((callThreshold) => {
    const r = winRate(mk({ openingFraction: 1 / 4, threshold, callThreshold }));
    return `${(r.wr * 100).toFixed(1)}`.padStart(7);
  });
  console.log(`  ${threshold.toFixed(2)}         ` + row.join(""));
}
