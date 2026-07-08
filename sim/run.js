import { readFileSync } from "node:fs";

import {
  CompositeStrategy,
  OpeningBetStrategy,
  OpponentAwareDudoStrategy,
} from "../lib/strategy.js";
import { playGame } from "./engine.js";
import { buildOpponentsFromStore } from "./opponentModel.js";

const GAMES = Number(process.env.GAMES ?? 20000);
const DICE_PER_PLAYER = 5;

const store = JSON.parse(
  readFileSync(new URL("../data/opponent-bets.json", import.meta.url), "utf8"),
);

/** statsFor() provider backed by the recorded opponent summaries. */
function statsProvider(store) {
  return {
    statsFor(name) {
      const o = store.opponents?.[name];
      if (!o) return null;
      return {
        teamName: o.teamName,
        totalBets: o.totalBets,
        timeouts: o.timeouts,
        outcomesKnown: o.outcomesKnown,
        bluffRate: o.bluffRate,
        avgCount: o.avgCount,
        faceCounts: { ...o.faceCounts },
      };
    },
  };
}

/** Our production strategy, exactly as configured in index.js. */
function currentStrategy() {
  return new CompositeStrategy({
    opening: new OpeningBetStrategy({ openingFraction: 1 / 3 }),
    response: new OpponentAwareDudoStrategy({
      threshold: 0.5,
      callThreshold: 0.5,
      bluffWeight: 0.4,
      opponents: statsProvider(store),
    }),
  });
}

function makeDiag() {
  return {
    games: 0,
    wins: 0,
    placements: [], // finishing position per game (1 = win)
    dieLossAsBidderFalse: 0, // our bet challenged and was false
    dieLossAsCallerWrong: 0, // we challenged a true bet
    ourOpeningBusts: 0, // we opened the round and that opening bet got busted
    ourOpenings: 0,
    ourChallenges: 0,
    ourChallengesWrong: 0,
    roundsWeBid: 0,
    onRoundEnd(e) {
      if (e.loserIsUs) {
        if (e.bidderIsUs && !e.betTrue) {
          this.dieLossAsBidderFalse++;
          if (e.openerWasBidder) this.ourOpeningBusts++;
        }
        if (e.callerIsUs && e.betTrue) this.dieLossAsCallerWrong++;
      }
      if (e.callerIsUs) {
        this.ourChallenges++;
        if (e.betTrue) this.ourChallengesWrong++;
      }
      if (e.openerName === US && e.openerWasBidder) this.ourOpenings++;
    },
  };
}

const US = "MMath";

function runConfig(label, strategyFactory) {
  const opponents = buildOpponentsFromStore(store);
  const diag = makeDiag();

  for (let g = 0; g < GAMES; g++) {
    const seats = opponents.map((op) => ({
      name: op.name,
      strategy: op,
      isUs: false,
      dice: [],
    }));
    // Insert our seat at a rotating position for fairness.
    const usSeat = { name: US, strategy: strategyFactory(), isUs: true, dice: [] };
    seats.splice(g % (seats.length + 1), 0, usSeat);

    diag.games++;
    const { winner } = playGame({ seats, dicePerPlayer: DICE_PER_PLAYER, diag });
    if (winner === US) diag.wins++;
  }

  const n = seats_count(store);
  const baseline = 1 / n;
  return { label, n, baseline, diag };
}

function seats_count(store) {
  const opp = Object.values(store.opponents ?? {}).filter((o) => !o.isSelf).length;
  return opp + 1;
}

function report({ label, n, baseline, diag }) {
  const winRate = diag.wins / diag.games;
  const edge = winRate / baseline;
  const busts = diag.dieLossAsBidderFalse + diag.dieLossAsCallerWrong;
  console.log(`\n=== ${label} ===`);
  console.log(`games: ${diag.games}   players/game: ${n}`);
  console.log(
    `win rate: ${(winRate * 100).toFixed(2)}%   (fair share ${(baseline * 100).toFixed(1)}%, index ${edge.toFixed(2)}x)`,
  );
  console.log(`our die losses  : ${busts}`);
  console.log(
    `  as bidder (our bet was false when challenged): ${diag.dieLossAsBidderFalse}  (${pct(diag.dieLossAsBidderFalse, busts)})`,
  );
  console.log(
    `    of which were our OPENING bet             : ${diag.ourOpeningBusts}  (${pct(diag.ourOpeningBusts, diag.dieLossAsBidderFalse)} of bidder losses)`,
  );
  console.log(
    `  as caller (we challenged a TRUE bet)        : ${diag.dieLossAsCallerWrong}  (${pct(diag.dieLossAsCallerWrong, busts)})`,
  );
  console.log(
    `our challenges: ${diag.ourChallenges}   wrong (bet was true): ${diag.ourChallengesWrong}  (${pct(diag.ourChallengesWrong, diag.ourChallenges)} misfire)`,
  );
}

function pct(a, b) {
  return b ? `${((a / b) * 100).toFixed(1)}%` : "n/a";
}

// --- Run the current production strategy, plus controlled variants that
//     isolate the suspected opening-bet weakness. -------------------------

report(runConfig("CURRENT (opening 1/3, OpponentAwareDudo)", currentStrategy));

report(
  runConfig("VARIANT A: opening 1/4", () =>
    new CompositeStrategy({
      opening: new OpeningBetStrategy({ openingFraction: 1 / 4 }),
      response: new OpponentAwareDudoStrategy({
        threshold: 0.5,
        callThreshold: 0.5,
        bluffWeight: 0.4,
        opponents: statsProvider(store),
      }),
    }),
  ),
);

report(
  runConfig("VARIANT B: opening 1/4 + tighter calls (callThreshold 0.4)", () =>
    new CompositeStrategy({
      opening: new OpeningBetStrategy({ openingFraction: 1 / 4 }),
      response: new OpponentAwareDudoStrategy({
        threshold: 0.5,
        callThreshold: 0.4,
        bluffWeight: 0.4,
        opponents: statsProvider(store),
      }),
    }),
  ),
);
