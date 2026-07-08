import { readFileSync } from "node:fs";

import {
  CompositeStrategy,
  OpeningBetStrategy,
  OpponentAwareDudoStrategy,
} from "../lib/strategy.js";
import { playGame } from "./engine.js";
import { buildOpponentsFromStore } from "./opponentModel.js";

const GAMES = Number(process.env.GAMES ?? 3000);
const DICE = Number(process.env.DICE ?? 20);
const US = "MMath";

const store = JSON.parse(
  readFileSync(new URL("../data/opponent-bets.json", import.meta.url), "utf8"),
);
const stats = {
  statsFor: (name) => (store.opponents?.[name] ? { ...store.opponents[name] } : null),
};

function run(label, factory) {
  const opponents = buildOpponentsFromStore(store);
  let wins = 0;
  let bidderLoss = 0;
  let callerLoss = 0;
  const d = {
    onRoundEnd(e) {
      if (e.loserIsUs && e.bidderIsUs && !e.betTrue) bidderLoss++;
      if (e.loserIsUs && e.callerIsUs && e.betTrue) callerLoss++;
    },
  };
  for (let g = 0; g < GAMES; g++) {
    const seats = opponents.map((op) => ({ name: op.name, strategy: op, isUs: false, dice: [] }));
    seats.splice(g % (seats.length + 1), 0, { name: US, strategy: factory(), isUs: true, dice: [] });
    const { winner } = playGame({ seats, dicePerPlayer: DICE, diag: d });
    if (winner === US) wins++;
  }
  console.log(
    `${label.padEnd(42)} win ${((wins / GAMES) * 100).toFixed(1)}%  | dieLoss bidder=${bidderLoss} caller=${callerLoss}`,
  );
}

const mk = (raiseStyle, threshold) => () =>
  new CompositeStrategy({
    opening: new OpeningBetStrategy({ openingFraction: 1 / 4 }),
    response: new OpponentAwareDudoStrategy({
      threshold,
      callThreshold: 0.4,
      bluffWeight: 0.4,
      raiseStyle,
      opponents: stats,
    }),
  });

console.log(`GAMES=${GAMES}  DICE/player=${DICE} (totalDice=${DICE * 5})\n`);
run("OLD baseline (strongest, thr 0.50)", () =>
  new CompositeStrategy({
    opening: new OpeningBetStrategy({ openingFraction: 1 / 3 }),
    response: new OpponentAwareDudoStrategy({
      threshold: 0.5,
      callThreshold: 0.5,
      bluffWeight: 0.4,
      raiseStyle: "strongest",
      opponents: stats,
    }),
  }),
);
run("strongest, thr 0.65", mk("strongest", 0.65));
run("minimal,   thr 0.65", mk("minimal", 0.65));
run("minimal,   thr 0.55", mk("minimal", 0.55));
run("minimal,   thr 0.50", mk("minimal", 0.5));
