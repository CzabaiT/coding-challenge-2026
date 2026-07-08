import { RollerAgent } from "./lib/agent.js";
import { CappedSixesStrategy } from "./lib/strategy.js";

const config = {
  host: process.env.ROLLER_HOST ?? "ws://10.236.120.188:4000",
  teamName: process.env.ROLLER_TEAM ?? "MMath",
  secret: process.env.ROLLER_SECRET ?? "roller-dev-secret",
};

// Bet only on 6s, never claiming more than 1/3 of the dice in play.
// Swap this for your own `Strategy` subclass to change how the bot plays.
const strategy = new CappedSixesStrategy({ fraction: 1 / 3, value: 6 });

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
