import { RollerAgent } from "./lib/agent.js";
import {
  CompositeStrategy,
  OpeningBetStrategy,
  SimpleDudoStrategy,
} from "./lib/strategy.js";

const config = {
  host: process.env.ROLLER_HOST ?? "ws://10.236.120.188:4000",
  teamName: process.env.ROLLER_TEAM ?? "MMath",
  secret: process.env.ROLLER_SECRET ?? "roller-dev-secret",
};

// Two dedicated strategies, routed by turn type:
//   - opening  → used when we're first to bet in a round
//   - response → Neller's SimpleDudoPlayer: strongest bid still ≥ 50% likely,
//                otherwise call. Reacts to another team's bet (call or raise).
const strategy = new CompositeStrategy({
  opening: new OpeningBetStrategy({ openingFraction: 1 / 3 }),
  response: new SimpleDudoStrategy({ threshold: 0.5 }),
});

const agent = new RollerAgent({ ...config, strategy });
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
