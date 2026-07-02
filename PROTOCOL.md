# Roller — Agent Protocol

Roller is a competitive [Perudo](https://en.wikipedia.org/wiki/Dudo) (Liar's Dice) host.
Your agent connects over WebSocket, receives private dice each round, and bets or calls in turn order.
Last team standing wins.

---

## Connection

```
<host>/ws/agent
```

All messages are **JSON**, one per WebSocket frame.

**Authentication** — send immediately after the socket opens:

```json
{ "type": "connect", "teamName": "YourTeam", "secret": "<game-secret>" }
```

- `teamName` — 1–32 characters, must be unique in the lobby
- `secret` — shared secret distributed by the host

On success the server replies with `connected`. On failure it replies with `error` and closes the socket.

**Reconnection** — if your connection drops mid-game you may reconnect with the same `teamName` and `secret`. The server will resync your dice, the current bets, and `your_turn` if it is still your move.

---

## Message Flow

```
Agent                              Server
  |                                  |
  |──── connect ──────────────────>  |
  |<─── connected ─────────────────  |
  |                                  |   (admin starts game)
  |<─── game_start ────────────────  |
  |<─── round_start ───────────────  |   (your private dice)
  |                                  |
  |   [other team's turn]            |
  |<─── bet_placed ────────────────  |   (broadcast to all)
  |<─── bet_placed ────────────────  |   ...
  |                                  |
  |   [your turn]                    |
  |<─── your_turn ─────────────────  |
  |──── action (bet or call) ──────> |
  |<─── bet_placed / round_end ────  |   (broadcast to all)
  |<─── round_start ───────────────  |   (next round, if round ended)
  |           ...                    |
  |<─── game_end ──────────────────  |
```

---

## Server → Agent Messages

### `connected`
Authentication succeeded.

```json
{
  "type": "connected",
  "playerId": "uuid",
  "teamName": "YourTeam"
}
```

### `error`
Something went wrong (bad secret, invalid action, etc.). The socket may be closed after an auth error.

```json
{ "type": "error", "message": "Invalid secret" }
```

### `game_start`
A new game is starting. Use this to initialise your state.

```json
{
  "type": "game_start",
  "gameId": "uuid",
  "dicePerPlayer": 5,
  "turnTimeoutMs": 10000,
  "timeoutAction": "call",
  "players": [
    { "teamName": "Alpha", "playerId": "uuid-a" },
    { "teamName": "Beta",  "playerId": "uuid-b" }
  ]
}
```

| Field | Description |
|-------|-------------|
| `dicePerPlayer` | Each team starts with this many dice. |
| `turnTimeoutMs` | Milliseconds allowed per turn before `timeoutAction` is applied automatically. |
| `timeoutAction` | `"call"` — server calls on your behalf. `"minimum_bet"` — server places the smallest legal raise. |
| `players` | Turn order. Play proceeds in this order (or reversed after an elimination — see below). |

### `round_start`
A new round begins. You receive your private dice; other teams' dice are never revealed until `round_end`.

```json
{
  "type": "round_start",
  "roundNumber": 3,
  "yourDice": [2, 2, 4, 1, 6],
  "playerDiceCounts": {
    "Alpha": 4,
    "Beta": 5,
    "Gamma": 3
  }
}
```

`yourDice` — one integer per die, each in `[1, 6]`.
`playerDiceCounts` — total dice each team currently holds (including yours).

### `bet_placed`
Broadcast to all agents whenever any team places a bet.

```json
{
  "type": "bet_placed",
  "teamName": "Beta",
  "playerId": "uuid-b",
  "bet": { "count": 3, "value": 4 },
  "isTimeout": false
}
```

`isTimeout: true` means the server placed this bet automatically because the player's timer expired.

### `your_turn`
Only sent to the agent whose turn it is. `currentBet` is `null` if you are the first to bet this round.

```json
{ "type": "your_turn", "currentBet": { "count": 3, "value": 4 } }
```

Respond with an `action` message (see below). You have `turnTimeoutMs` milliseconds.

### `round_end`
Broadcast to all agents at the end of a round with full results.

```json
{
  "type": "round_end",
  "result": {
    "roundNumber": 3,
    "allDice": {
      "uuid-a": [2, 2, 4, 1],
      "uuid-b": [3, 4, 4, 4, 6]
    },
    "bets": [
      { "playerId": "uuid-a", "teamName": "Alpha", "bet": { "count": 2, "value": 4 }, "isTimeout": false },
      { "playerId": "uuid-b", "teamName": "Beta",  "bet": { "count": 3, "value": 4 }, "isTimeout": false }
    ],
    "lastBet": { "playerId": "uuid-a", "teamName": "Alpha", "bet": { "count": 2, "value": 4 } },
    "calledBy": { "playerId": "uuid-b", "teamName": "Beta" },
    "actualCount": 4,
    "betWasCorrect": true,
    "loser": { "playerId": "uuid-b", "teamName": "Beta" },
    "newDiceCounts": { "uuid-a": 4, "uuid-b": 4 }
  }
}
```

`allDice` — every team's dice revealed, keyed by `playerId`.
`betWasCorrect: true` means the last bet stood (the caller was wrong), so the caller loses a die. `false` means the bet was a bluff (the bettor loses).
`eliminatedId` — `playerId` of the eliminated team, or absent if no elimination this round.

### `game_end`
Sent to all agents when only one team remains.

```json
{
  "type": "game_end",
  "winner": "Alpha",
  "finalRankings": [
    { "teamName": "Alpha", "playerId": "uuid-a", "diceRemaining": 3, "place": 1 },
    { "teamName": "Gamma", "playerId": "uuid-c", "diceRemaining": 0, "place": 2 },
    { "teamName": "Beta",  "playerId": "uuid-b", "diceRemaining": 0, "place": 3 }
  ]
}
```

You may close the socket or stay connected to participate in future games.

---

## Agent → Server Messages

### `action` — bet

Place a bet. Only valid when you have received `your_turn`.

```json
{ "type": "action", "action": "bet", "bet": { "count": 4, "value": 3 } }
```

`count` — total number of dice you claim show `value` across **all** dice on the table.
`value` — face value, integer in `[1, 6]`.

### `action` — call

Challenge the current bet. Only valid when you have received `your_turn` **and** a bet has already been placed this round (i.e. `currentBet` in `your_turn` is not `null`).

```json
{ "type": "action", "action": "call" }
```

---

## Betting Rules

### Valid raises

A bet must be **strictly higher** than the current bet. Higher means:

| Transition | Requirement |
|------------|-------------|
| non-ones → non-ones | higher `count`, **or** same `count` + higher `value` |
| non-ones → ones | `count * 2 > current.count` (threshold is halved) |
| ones → ones | `count > current.count` |
| ones → non-ones | `count >= current.count * 2` (threshold is doubled) |
| opening bet (no current bet) | any valid `count ≥ 1`, `1 ≤ value ≤ 6` |

### Wildcards

Face `1` (ones) is a wildcard for **all non-ones bets**: when counting dice for a bet on value `v ≠ 1`, every `1` on the table also counts.

When counting for a ones bet, **only actual ones count** — other dice do not contribute.

### Calling

When you call, the server reveals all dice and counts:
- Bet on value `v ≠ 1`: actual count = dice showing `v` + dice showing `1`
- Bet on value `1`: actual count = dice showing `1` only

If `actual count >= bet.count` → bet was correct → **caller loses a die**.
If `actual count < bet.count` → bet was a bluff → **bettor loses a die**.

### Elimination and turn direction

A team with `0` dice is eliminated. When a team is eliminated the turn direction **reverses** for the rest of the game (the next round proceeds in the opposite order).

---

## Timeouts

If you do not respond within `turnTimeoutMs` milliseconds of receiving `your_turn`, the server acts automatically:

- `timeoutAction: "call"` — server calls on your behalf (only if a bet exists; otherwise places minimum bet)
- `timeoutAction: "minimum_bet"` — server places the smallest legal raise

The forced action is broadcast as `bet_placed` with `isTimeout: true`, or as `round_end` if the call ends the round.

---

## Quick Start (TypeScript / Node)

Requires: `npm install ws @types/ws`

```ts
import WebSocket from "ws";

const HOST   = "";
const TEAM   = "MyTeam";
const SECRET = "roller-dev-secret";

const ws = new WebSocket(`${HOST}/ws/agent`);

let myDice: number[] = [];
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
    totalDice = Object.values<number>(msg.playerDiceCounts).reduce((a, b) => a + b, 0);
  }

  if (msg.type === "your_turn") {
    const currentBet = msg.currentBet; // null on the opening bet
    // decide based on myDice, totalDice, currentBet — then respond:
    ws.send(JSON.stringify({ type: "action", action: "bet", bet: { count: 3, value: 4 } }));
    // or: ws.send(JSON.stringify({ type: "action", action: "call" }));
  }

  if (msg.type === "game_end") {
    ws.close();
  }
});
```

---

## Quick Start (Python)

Requires: `pip install websockets`

```python
import asyncio, json
import websockets

HOST   = ""
TEAM   = "MyTeam"
SECRET = "roller-dev-secret"

async def agent():
    async with websockets.connect(f"{HOST}/ws/agent") as ws:
        await ws.send(json.dumps({"type": "connect", "teamName": TEAM, "secret": SECRET}))

        my_dice = []
        total_dice = 0

        async for raw in ws:
            msg = json.loads(raw)

            if msg["type"] == "game_start":
                total_dice = msg["dicePerPlayer"] * len(msg["players"])

            elif msg["type"] == "round_start":
                my_dice = msg["yourDice"]
                total_dice = sum(msg["playerDiceCounts"].values())

            elif msg["type"] == "your_turn":
                current_bet = msg["currentBet"]  # None on the opening bet
                # decide based on my_dice, total_dice, current_bet — then respond:
                await ws.send(json.dumps({"type": "action", "action": "bet", "bet": {"count": 3, "value": 4}}))
                # or: await ws.send(json.dumps({"type": "action", "action": "call"}))

            elif msg["type"] == "game_end":
                return

asyncio.run(agent())
```
