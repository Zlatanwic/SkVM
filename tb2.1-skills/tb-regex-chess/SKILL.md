---
name: tb-regex-chess
description: Implement a complete chess move generator using only regular expression find-and-replace pairs on FEN notation, producing `/app/re.json` — a list of `[regex, replacement]` pairs that transform a FEN string into all legal next positions. Use this skill whenever the task involves regex-based chess generation, FEN string manipulation via `re.sub`, implementing chess rules (castling, en-passant, promotion) through regex transformations, or producing a `re.json` file under size constraints. Also trigger when the user references `all_legal_next_positions()`, FEN notation regex patterns, or the `/app/re.json` output file.
---

# tb-regex-chess

Build a chess move generator that operates entirely through regular expression
substitutions on FEN strings, output as `/app/re.json` — a list of
`[pattern, replacement]` pairs. This is one of the Terminal-Bench 2.1 task
skills; the full task lives at `tasks/regex-chess/` in the same repo as this
skill.

## When this skill triggers

Use it when the user is dropped into the `regex-chess` Docker container and
needs to produce a regex-based chess move generator. Do **not** use it for
traditional chess engines, bitboard-based generators, or any task that uses
procedural code instead of regex substitutions to generate moves.

## Goal (one sentence)

Generate all legal chess moves for a given FEN position using only regex
substitutions, capturing castling, en-passant, and promotion-to-queen in
`/app/re.json`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/re.json` | JSON array of `[regex, replacement]` pairs. Under 100,000 pairs and under 10 MB total. |

The verifier runs `all_legal_next_positions(fen)` using `check.py`-style
evaluation and checks that the output matches the expected legal FEN positions.

## Recommended workflow

### 1. Understand the evaluation harness (≈ 5 min)

Read `check.py` in the task directory. The core loop is:

```python
def all_legal_next_positions(fen):
    for pattern, repl in json.load(open("/app/re.json")):
        fen = re.sub(pattern, repl, fen)
    return fen.split("\n")
```

This means each `[regex, replacement]` pair is applied **in order** to the FEN
string. The final string is split on `\n` to get individual FEN positions — one
per line. The regex pairs must transform the initial FEN into a newline-separated
list of all legal successor FENs.

Key constraints from the task:
- White to move only.
- Promotions are always to Queen (underpromotion is not legal).
- Full-move and half-move counters are allowed to be incorrect.
- Castling, en-passant, and promotion must be implemented correctly.
- Under 100,000 pairs and under 10 MB.

### 2. Understand the FEN format (≈ 5 min)

A FEN string has 6 space-separated fields:
```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```
1. **Piece placement**: 8 ranks separated by `/`, from rank 8 to rank 1.
   Digits are empty squares. Letters are pieces (uppercase = white, lowercase = black).
2. **Active color**: `w` (white to move).
3. **Castling availability**: `KQkq` or `-`.
4. **En-passant target square**: e.g., `e3` or `-`.
5. **Halfmove clock** (ignored in scoring).
6. **Fullmove number** (ignored in scoring).

### 3. Design the regex transformation strategy (≈ 15 min planning)

The regex-only approach works by pattern-matching piece configurations and
rewriting them. General strategies:

**Piece movement**: Match a piece on a square and replace it with an empty
square while placing the piece on the target square. For example, moving
a pawn from e2 to e4:

```
Pattern: (.*/)P(.*/)(.*/)(.*/)(.*/)(.*/)8(/.*)
Replacement: \\1\\2\\3\\4\\5\\6P\\7
```
(This is simplified — actual patterns are far more complex.)

**Multiple moves**: The key insight is to generate all moves by using
`re.sub` in a way that produces multiple copies of the FEN, one per legal
move. This often involves matching a piece and using a replacement that
produces `\n`-separated FEN strings, or using intermediate markers that
are later expanded.

**Common technique — marker expansion**:
1. First pass: match a piece at a position and replace with a special marker
   at both source and destination.
2. Intermediate passes: expand markers into concrete positions.
3. Final pass: clean up markers into proper FEN format.

### 4. Implement the regex pairs (≈ 60+ min)

Start with the simplest piece and build up:

**Pawn moves (white)**:
- Single push: pawn on rank 2 can move to rank 3 if empty.
- Double push: pawn on rank 2 can move to rank 4 if both squares empty.
- Capture left/right: diagonal captures.
- En-passant: special capture when the target square matches the EP field.
- Promotion: pawn reaching rank 8 becomes `Q`.

**Knight moves**: 8 possible L-shaped destinations.

**Bishop, Rook, Queen moves**: Sliding pieces. This is the hardest part with
regex — you need to check each direction until blocked by a piece or the board
edge. Each direction may need a separate pair per square.

**King moves**: 8 surrounding squares, plus castling.

**Castling**: Modify king and rook positions simultaneously, update castling
rights field.

### 5. Test against the provided example (≈ 5 min)

```bash
python3 check.py
```

The example FEN:
```
rnb1k1nr/p2p1ppp/3B4/1p1NPN1P/6P1/3P1Q2/P1P5/q4Kb1 w kq - 0 1
```
Must produce exactly the expected output (with lenient move counters).

### 6. Iterate until all tests pass (≈ variable)

- Run `check.py` after each batch of new regex pairs.
- Watch for: wrong moves generated, missing moves, illegal moves included.
- Keep the total pair count and file size under limits.

## Verifier checklist (must all pass)

- [ ] `/app/re.json` exists and is valid JSON.
- [ ] File is under 100,000 `[regex, replacement]` pairs.
- [ ] File is under 10 MB in total size.
- [ ] Running `all_legal_next_positions(fen)` on the example FEN produces
      exactly the expected output positions.
- [ ] The generator produces correct legal moves for other test positions.
- [ ] Castling rights are tracked correctly.
- [ ] En-passant captures are handled correctly.
- [ ] Promotions are to Queen only.

## Common pitfalls

1. **Forgetting that `re.sub` is applied sequentially.** Each pair transforms
   the entire string, and the next pair operates on the result. If a pair
   accidentally matches the output of a previous pair, you get cascading
   errors. Use unique intermediate markers that won't collide.
2. **Sliding piece moves are the hardest.** A rook on a1 can move to a2-a8
   and b1-h1, but only until blocked. Regex cannot "loop" — each legal
   destination for each piece on each square needs its own pair (or a clever
   encoding). This is why the file can have up to 100,000 pairs.
3. **FEN rank ordering is reversed.** Rank 8 is the top of the FEN string.
   Pawn movement for white (ranks 2-7) goes "down" the string (higher rank
   number, lower in the string). Getting the direction wrong inverts all moves.
4. **Castling rights must be updated.** After a king or rook moves, or after
   a rook is captured, the castling availability field must change. Regex
   patterns need to detect these events and remove the relevant castling
   right letter.
5. **En-passant is stateful.** The en-passant target square only exists for
   one turn after a double pawn push. Your regex pairs must check the EP
   field of the FEN and only allow the capture when the target matches.

## Reference pointers

- FEN specification: https://en.wikipedia.org/wiki/Forsyth-Edwards_Notation
- The `check.py` file in the task directory is the authoritative evaluator.
- The file `tasks/regex-chess/solution/` contains the reference solution —
  study it only after attempting your own approach.
- The regex-chess paper/blog post by Nicholas Carlini describes the technique
  of encoding computation in regex substitutions.
