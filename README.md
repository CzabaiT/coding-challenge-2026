# 🎲 ROLLER — Game Day Plan 🎲

```
    ╔══════════════════════════════════════════════════════════╗
    ║                                                          ║
    ║     ██████╗  ██████╗ ██╗     ██╗     ███████╗██████╗     ║
    ║     ██╔══██╗██╔═══██╗██║     ██║     ██╔════╝██╔══██╗    ║
    ║     ██████╔╝██║   ██║██║     ██║     █████╗  ██████╔╝    ║
    ║     ██╔══██╗██║   ██║██║     ██║     ██╔══╝  ██╔══██╗    ║
    ║     ██║  ██║╚██████╔╝███████╗███████╗███████╗██║  ██║    ║
    ║     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝    ║
    ║                                                          ║
    ║          Liar's Dice. Team vs Team. No mercy.            ║
    ║                                                          ║
    ║                    ┌───┐ ┌───┐ ┌───┐                     ║
    ║                    │ ⚀ │ │ ⚁ │ │ ⚂ │  ...bluff wisely    ║
    ║                    └───┘ └───┘ └───┘                     ║
    ╚══════════════════════════════════════════════════════════╝
```

> *"There is no five ones."* — someone, probably lying

![Dice roll](https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif)

---

## The Big Picture

Welcome to **Roller** — a team-vs-team Perudo (Liar's Dice) showdown where your agents bluff, challenge, and sweat over every `(count, value)` bet while humans watch the chaos unfold on the big screen.

**Total runtime:** 3 hours  
**Pace:** one round at the end of every **30 minutes**  
**That's 6 rounds** — enough time to warm up, climb the leaderboard, and throw everything at the final double-points bonanza.

Grab your team. Tune your bot. The dice don't care about your feelings.

[The Agent Protocol](PROTOCOL.md)

---

## Schedule at a Glance

**`T` is planned to be 15:30**

| # | Round | Time | Points? | Notes |
|---|-------|----------|---------|-------|
| 0 | **Warm-up** | T+00:30 | ❌ None | Shake out the bugs. No scoreboard tears yet. |
| 1 | Round 1 | T+01:00 | ✅ Normal | The climb begins. |
| 2 | Round 2 | T+01:30 | ✅ Normal | Rivalries form. |
| 3 | Round 3 | T+02:00 | ✅ Normal | Mid-game drama. |
| 4 | Round 4 | T+02:30 | ✅ Normal | Last chance to pad your lead. |
| 5 | **FINAL** | T+03:00 | 🔥 **DOUBLE** | Everything counts twice. Go big or go home. |

```
  0h            1h          2h             3h
  |-------------|-----------|--------------|
  [warm-up][ R1 ][ R2 ][ R3 ][ R4 ][ FINAL ]
     🧪        normal points         ×2 pts
```

---

## Scoring — How Points Work

### Warm-up (Round 0)

**No points.** This round exists so teams can:

- Connect their agents and confirm everything talks to the server
- Get a feel for turn timing and bet flow
- Make spectacularly bad opening bluffs with zero consequences

Consider it the dress rehearsal. The audience still watches. The shame is still real. Just... it doesn't count.

### Rounds 1–4 — Normal Scoring

When your team is **eliminated** in a round, you earn points based on **how many teams were knocked out before you**:

> **Your points = number of teams eliminated before yours**

Examples with **4 teams** (A, B, C, D):

| Elimination order | Team | Points earned |
|-------------------|------|---------------|
| 1st out | A | **0** — first to fall, no pity points |
| 2nd out | B | **1** — one team went down before you |
| 3rd out | C | **2** — two teams fell first |
| Winner 🏆 | D | **3** — everyone else eliminated |

Survive longer → score bigger. Getting eliminated early is a quiet round. Hanging on until the bitter end is how legends (and point totals) are made.

### Round 5 — FINAL (Double Points!)

Same rules as rounds 1–4, but **every point is worth double**.

That warm-up 2-pointer you wish you had in round 2? In the final, it would have been **4**. The leaderboard can flip. Underdogs can rise. Favorites can choke. That's the point.

```
  Normal round:  eliminated 2nd of 4 teams  →  1 pt
  FINAL round:   eliminated 2nd of 4 teams  →  2 pts  ✨

  Normal round:  WINNER of 4-team round    →  3 pts
  FINAL round:   WINNER of 4-team round    →  6 pts  🚀
```

---

## Watch It Live — Main TV

Every round is broadcast on the **main TV** via the Roller dashboard:

- **Live bets** scrolling as teams raise the stakes
- **Dice counts** dropping as eliminations stack up
- **Round history** — who bluffed, who called, who cried (internally)

Whether you're playing or spectating, the big screen is the place to be. Cheer. Gasp. Question every `(count, 1)` bet. It's all part of the show.

---

## The Prize

**Exciting reward for the winning team: surprise 🎁**

We won't spoil it. We might not even know what it is yet. But trust us — you want to be the team holding the trophy (and whatever mysterious glory comes with it) when the dice stop rolling.

```
        🏆
       /||\\
      / || \\
     /  ||  \\
    ═══════════
   WINNER TEAM
   (details TBD
    but it's good)
```

---

## Quick Rules Reminder

Just in case your agent forgot to read the manual:

- Each team starts with a pile of dice. Bet on how many of a value exist **across everyone's dice**.
- **Ones are wild** (unless you're betting on ones — then it's ones only).
- **Raise** the bet or **call** the bluff. Wrong call = you lose a die.
- **0 dice = eliminated.** Last team standing wins the round.

Bluff with confidence. Call with conviction. And may the odds be ever in your favor — or at least convincingly fabricated.

---

## See You at the Table

Six rounds. Three hours. One mysterious prize.

**Round 0 is free. Rounds 1–4 build the story. The FINAL writes the legend.**

🎲 *Roll on.* 🎲
