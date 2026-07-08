import { RollerAgent } from "./lib/agent.js";
import { BetStore } from "./lib/betStore.js";
import { createLogger } from "./lib/logger.js";
import {
  CompositeStrategy,
  OpeningBetStrategy,
  OpponentAwareDudoStrategy,
} from "./lib/strategy.js";

const config = {
  host: process.env.ROLLER_HOST ?? "ws://10.236.120.188:4000",
  teamName: process.env.ROLLER_TEAM ?? "MMath",
  secret: process.env.ROLLER_SECRET ?? "roller-dev-secret",
};

// One BetStore shared between the agent (which records opponents' bets) and the
// response strategy (which reads their history back out) so the bot can adapt
// to how each team plays.
const logger = createLogger();
const betStore = new BetStore({ logger });

// Two dedicated strategies, routed by turn type:
//   - opening  → used when we're first to bet in a round
//   - response → SimpleDudo raise, but the decision to *challenge* is shaded by
//                the standing bidder's recorded bluff rate: call habitual
//                bluffers on thinner evidence, give honest bidders more rope.
//
// Tuning (from data/opponent-bets.json + sim/): our old config always bid the
// *strongest* safe claim at the 50% edge, so in large-dice games it leapt
// straight to the distribution mean (e.g. an opening response of 179×4) — a
// coin flip opponents could just call. That made us the most-caught bidder
// (bluffRate ~0.65) and got us eliminated 4th. The fixes, all validated in sim
// across both small- (25 dice) and large- (100+ dice) regimes:
//   - raiseStyle "minimal": make the smallest safe raise instead of jumping to
//     the mean, so we never volunteer a coin-flip bet and keep our options open.
//   - openingFraction 1/4 (was 1/3): open comfortably below the expected count.
//   - callThreshold 0.4 (was 0.5): slightly less trigger-happy on challenges.
// With minimal raises we no longer need a high safety bar, so threshold stays at
// the intuitive 0.5 (raise only into bids more likely true than not).
const strategy = new CompositeStrategy({
  opening: new OpeningBetStrategy({ openingFraction: 1 / 4 }),
  response: new OpponentAwareDudoStrategy({
    threshold: 0.5,
    callThreshold: 0.4,
    bluffWeight: 0.4,
    raiseStyle: "minimal",
    opponents: betStore,
  }),
});

const agent = new RollerAgent({ ...config, strategy, logger, betStore });
agent.connect();

// Last-resort safety nets: log instead of crashing so the agent's own
// reconnect logic can keep the socket alive through unexpected errors.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("SIGINT", () => {
  console.log("\nShutting down …");
  agent.disconnect();
  process.exit(0);
});
