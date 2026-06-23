---
name: tb-winning-avg-corewars
description: Write a competitive CoreWars Redcode warrior achieving specific win rates against five classic opponent strategies. Use this skill when the task mentions CoreWars, Redcode, pMARS, `/app/my_warrior.red`, achieving win rates against stone/paper/vampire/snake/g2-clear, or the 75%/33% win thresholds. Also trigger when the user references the pMARS simulator, `pmars -b -r 100`, `warriors/` directory with opponent `.red` files, or CoreWars strategy design (bombers, replicators, scanners, clear-scanners).
---

# tb-winning-avg-corewars

Write a CoreWars Redcode program (`my_warrior.red`) that beats three opponents
(stones, vampires, papers) at >= 75% win rate and two tougher opponents (snake,
g2-clear) at >= 33% win rate using pMARS over 100-round battles. This is a
Terminal-Bench 2.1 task; the full task lives at `tasks/winning-avg-corewars/`
in the same repo.

## When this skill triggers

Use it when the user is dropped into the `winning-avg-corewars` Docker container
and needs to produce `/app/my_warrior.red`. Do **not** use it for general
assembly programming, genetic algorithms for CoreWars, or strategy design for
other simulators (nanoMARS, CoreWin, etc.). This is specifically for pMARS with
core size 8000 and max cycles 80000.

## Goal (one sentence)

Write a single Redcode warrior that achieves >= 75% wins against stones,
vampires, and papers, and >= 33% wins against snake and g2-clear over 100-round
pMARS battles.

## Required outputs

| File | Purpose |
|---|---|
| `/app/my_warrior.red` | Redcode warrior program. Must compile and run in pMARS (core=8000, cycles=80000). |

## Recommended workflow

### 1. Study the opponents (≈ 10 min)

Read each opponent's code in `warriors/` to understand their strategy:

- **stone.red** -- Stone bomber: Drops `DAT` instructions every 4 positions,
  creating impenetrable walls. Weakness: slow to cover memory; can be outrun.
- **paper.red** -- Paper/replicator: Copies itself rapidly through memory using
  a tight copy loop. Weakness: vulnerable to scanners that find and kill the
  replicating code before it spreads.
- **vampire.red** -- Pit trapper: Scatters `JMP` instructions (fangs) that
  redirect enemy processes into a pit (infinite loop). Weakness: the trap
  density may be too low; a warrior with many processes (split) saturates traps.
- **snake.red** -- Snake: Copies itself and moves through memory. Weakness:
  predictable movement pattern; can be intercepted.
- **g2-clear.red** -- G2-Clear: Wipes memory with deadly `DAT` bombs. A
  clear-scanner hybrid. Weakness: vulnerable while scanning; slow to start.

### 2. Design your warrior strategy (≈ 15 min)

A successful approach combines multiple techniques:

**Bootstrap + clear-scanner**: A common all-round strategy.
1. **Bootstrap**: The first few instructions copy the warrior out of the initial
   location to avoid being targeted by the opponent's initial position.
2. **Scanner**: Scan core memory looking for non-zero instructions (enemy code).
3. **Clear**: When enemy code is found, bomb it with `DAT` to neutralize it.
4. **SPL bombing**: Use `SPL` instructions to create many parallel processes,
   overwhelming vampire traps and paper copies.

Key Redcode instructions:
- `MOV`, `ADD`, `SUB`, `MUL`, `DIV`, `MOD` -- arithmetic
- `JMP`, `JMZ`, `JMN`, `DJN` -- control flow and loops
- `SPL` -- create a new process (parallel execution)
- `DAT` -- data/death (kills the process that executes it)
- `CMP`, `SEQ`, `SNE` -- comparison for scanners

### 3. Implement and test iteratively (≈ 20 min)

```bash
# Test against each opponent individually
pmars -b -r 100 -f my_warrior.red warriors/stone.red
pmars -b -r 100 -f my_warrior.red warriors/vampire.red
pmars -b -r 100 -f my_warrior.red warriors/paper.red
pmars -b -r 100 -f my_warrior.red warriors/snake.red
pmars -b -r 100 -f my_warrior.red warriors/g2-clear.red
```

pMARS output shows wins/losses/ties per round. Track win percentages.

### 4. Iterate on weaknesses (≈ 15 min)

If losing to specific opponents:
- **Losing to paper**: Your scanner is too slow. Tighten the scan loop. Add
  `SPL` bombing to out-proliferate the paper.
- **Losing to stone**: You are hitting the stone's `DAT` wall. Make sure your
  bootstrap moves far away. Add protection (a `DJN` guard).
- **Losing to vampire**: You need more parallel processes. `SPL` aggressively
  so fangs cannot trap all your processes.
- **Losing to snake/g2-clear**: These are the hardest opponents. A well-tuned
  clear-scanner with fast initial copy is your best bet.

Common tuning parameters:
- Step size of the scanner (larger = faster scan, but can miss enemies).
- Number of initial `SPL` processes.
- Distance to bootstrap.
- The clear pattern (how `DAT` bombs are placed after finding the enemy).

### 5. Final validation (≈ 5 min)

```bash
# Run full suite
for opponent in stone paper vampire snake g2-clear; do
    echo "=== $opponent ==="
    pmars -b -r 100 -f my_warrior.red warriors/${opponent}.red | tail -5
done
```

Check total wins for each opponent. Ensure:
- stone, vampire, paper: >= 75 wins each.
- snake, g2-clear: >= 33 wins each.

## Verifier checklist (must all pass)

- [ ] `/app/my_warrior.red` exists and is valid Redcode.
- [ ] Warrior compiles correctly with pMARS.
- [ ] >= 75% wins (75+ out of 100) against `stone.red`.
- [ ] >= 75% wins (75+ out of 100) against `vampire.red`.
- [ ] >= 75% wins (75+ out of 100) against `paper.red`.
- [ ] >= 33% wins (33+ out of 100) against `snake.red`.
- [ ] >= 33% wins (33+ out of 100) against `g2-clear.red`.
- [ ] Opponent files in `warriors/` are not modified.

## Common pitfalls

1. **Not testing with enough rounds.** A warrior that gets lucky in 10 rounds
   may fail in 100. The verifier uses `-r 100`. Always test with 100 rounds to
   see true win rates.
2. **Warrior that ties too often.** pMARS counts ties as non-wins. If your
   warrior ties 30% of rounds against an opponent, you need at least 75 of the
   remaining 70 rounds to be wins (unrealistic). Design for decisive wins, not
   survival.
3. **Forgetting to bootstrap.** If your warrior starts at the same location
   every time and an opponent bombs that location early, you lose immediately.
   A `MOV` copy to a distant location is essential.
4. **Ignoring process limits.** pMARS limits the number of parallel processes.
   Over-using `SPL` can hit this limit, causing new processes to be dropped.
   Balance process creation with the simulator's limit.
5. **Modifying opponent files.** The verifier checks that `warriors/*.red` are
   unchanged. Read them for intelligence, but never write to them.

## Reference pointers

- pMARS documentation: `pmars --help` for batch mode flags.
- CoreWarrior tutorials: understanding the scanner/clear pattern, bootstrapping,
  and `SPL` bombing strategies.
- Opponent code in `warriors/`: `stone.red`, `paper.red`, `vampire.red`,
  `snake.red`, `g2-clear.red` -- study these to understand their weaknesses.
- Core size is 8000, max cycles is 80000. Your warrior must operate within
  these constraints.
- pMARS batch command: `pmars -b -r 100 -f my_warrior.red warriors/<opponent>.red`.
