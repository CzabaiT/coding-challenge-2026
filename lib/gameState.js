/**
 * The agent's view of the world, updated as server messages arrive.
 *
 * Strategies read from this object but never mutate it — mutation happens only
 * through the `apply*` methods below, one per relevant server message. That
 * separation keeps game bookkeeping in one place and strategy logic pure.
 */
export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    // Identity (set once we authenticate).
    this.playerId = null;
    this.teamName = null;

    // Game configuration (set on game_start).
    this.gameId = null;
    this.dicePerPlayer = 0;
    this.turnTimeoutMs = 10_000;
    this.timeoutAction = "call";
    this.players = [];

    // Per-round state.
    this.roundNumber = 0;
    this.myDice = [];
    this.playerDiceCounts = {};
    this.totalDice = 0;
    this.currentBet = null;
    this.roundBets = [];

    // Connection lifecycle flags.
    this.connected = false;
    this.inGame = false;
  }

  applyConnected(msg) {
    this.playerId = msg.playerId;
    this.teamName = msg.teamName;
    this.connected = true;
  }

  applyGameStart(msg) {
    this.gameId = msg.gameId;
    this.dicePerPlayer = msg.dicePerPlayer;
    this.turnTimeoutMs = msg.turnTimeoutMs;
    this.timeoutAction = msg.timeoutAction;
    this.players = msg.players;
    this.totalDice = msg.dicePerPlayer * msg.players.length;
    this.inGame = true;
  }

  applyRoundStart(msg) {
    this.roundNumber = msg.roundNumber;
    this.myDice = msg.yourDice;
    this.playerDiceCounts = msg.playerDiceCounts;
    this.totalDice = sumValues(msg.playerDiceCounts);
    this.currentBet = null;
    this.roundBets = [];
  }

  applyBetPlaced(msg) {
    this.currentBet = msg.bet;
    this.roundBets.push({
      teamName: msg.teamName,
      playerId: msg.playerId,
      bet: msg.bet,
      isTimeout: msg.isTimeout,
    });
  }

  applyYourTurn(msg) {
    this.currentBet = msg.currentBet;
  }

  applyRoundEnd(msg) {
    const { result } = msg;
    this.roundNumber = result.roundNumber;

    if (result.newDiceCounts) {
      // Re-key the server's playerId map onto team names for readable logs.
      this.playerDiceCounts = Object.fromEntries(
        this.players.map((player) => [
          player.teamName,
          result.newDiceCounts[player.playerId] ?? 0,
        ]),
      );
      this.totalDice = sumValues(this.playerDiceCounts);
    }

    this.currentBet = null;
    this.roundBets = [];
  }

  applyGameEnd() {
    this.inGame = false;
  }

  /** Look up a team name from a playerId (falls back to the raw id). */
  teamNameFor(playerId) {
    return (
      this.players.find((player) => player.playerId === playerId)?.teamName ??
      playerId
    );
  }
}

function sumValues(record) {
  return Object.values(record).reduce((total, value) => total + value, 0);
}
