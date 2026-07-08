import WebSocket from "ws";

const HOST = "ws://10.236.120.188:4000";
const TEAM = "MMath";
const SECRET = "roller-dev-secret";

const ws = new WebSocket(`${HOST}/ws/agent`);

let myDice = [];
let totalDice = 0;

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "connect", teamName: TEAM, secret: SECRET }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === "game_start") {
    totalDice = msg.dicePerPlayer * msg.players.length;
  }

  if (msg.type === "round_start") {
    myDice = msg.yourDice;
    totalDice =
      Object.values < number > msg.playerDiceCounts.reduce((a, b) => a + b, 0);
  }

  if (msg.type === "your_turn") {
    const currentBet = msg.currentBet; // null on the opening bet
    // decide based on myDice, totalDice, currentBet — then respond:
    ws.send(
      JSON.stringify({
        type: "action",
        action: "bet",
        bet: { count: 3, value: 4 },
      }),
    );
    // or: ws.send(JSON.stringify({ type: "action", action: "call" }));
  }

  if (msg.type === "game_end") {
    ws.close();
  }
});
