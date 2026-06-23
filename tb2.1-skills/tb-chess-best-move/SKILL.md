---
name: tb-chess-best-move
description: Analyze a chess position from an image, find the best move(s) for white using a chess engine, and write the result(s) to `/app/move.txt` in algebraic notation. Use this skill whenever the task mentions extracting a chess position from an image, using OCR or computer vision to read a chess board, running Stockfish or another UCI engine to find the best move, handling multiple winning moves, or writing moves to a file in `e2e4` format. The skill covers: reading `/app/chess_board.png`, extracting the board state (piece positions, side to move), setting up a chess engine, analyzing the position with adequate depth, and outputting one or more best moves.
---

# tb-chess-best-move

Extract a chess position from an image of a chess board, use a chess engine to
determine the best move(s) for White, and write the result to `/app/move.txt`.

## When this skill triggers

Use it when the user is dropped into the `chess-best-move` Docker container and
needs to produce `/app/move.txt` containing the best move for White. Do **not**
use it for generic chess programming tasks -- this is specifically about
image-based position extraction, UCI engine analysis, and handling the
possibility of multiple equally-optimal winning moves.

## Goal (one sentence)

Read the chess position from `/app/chess_board.png`, determine the best move
for White (to play) using a chess engine, and write it to `/app/move.txt` in
the format `[src][dst]` (e.g., `e2e4`), with multiple winning moves on separate
lines if they exist.

## Required outputs

| File | Purpose |
|---|---|
| `/app/move.txt` | One or more lines, each containing a move in `[src][dst]` format (e.g., `e2e4`). |

The verifier checks that at least one of the moves in the file is a correct
best/winning move for the given position.

## Recommended workflow

### 1. Survey the environment (≈ 2 min)

- Check what tools are available: `python3 --version`, `which stockfish`.
- If Stockfish is not installed: `apt-get update && apt-get install -y stockfish`.
- Check for Python chess libraries: `python3 -c "import chess; print('OK')"` or
  install with `pip install python-chess`.
- Check for image processing tools: `python3 -c "from PIL import Image; print('OK')"`.

### 2. Extract the board from the image (≈ 10 min)

Approach A -- Use Python libraries:
```python
from PIL import Image
import chess
import chess.engine

img = Image.open("/app/chess_board.png")
# Analyze pixel regions to determine piece positions
# The board is typically shown from White's perspective
# Map each square's visual content to a piece type
```

Approach B -- Use OCR:
```bash
# Install tesseract if available
apt-get install -y tesseract-ocr
tesseract /app/chess_board.png /tmp/chess_output
```

Approach C -- Use a dedicated chess-board recognition library:
```bash
pip install chess-board-recognizer
# or use a local model/script
```

The output should be a FEN string or a `chess.Board()` object representing the
position exactly.

### 3. Set up the chess engine (≈ 5 min)

```python
import chess.engine

engine = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
# or wherever stockfish is installed
```

Set analysis parameters:
- `chess.engine.Limit(depth=20)` or `chess.engine.Limit(time=2.0)`.
- Deeper analysis (depth 25+) is safer for finding the single best move.
- MultiPV mode can reveal multiple winning moves: configure with
  `engine.configure({"MultiPV": 3})`.

### 4. Analyze and extract best move(s) (≈ 5 min)

```python
board = chess.Board(fen_string)  # from step 2

# Single best move
result = engine.play(board, chess.engine.Limit(depth=25))
best_move = result.move.uci()  # e.g., "e2e4"

# Multiple winning moves (if the position has alternatives)
info = engine.analyse(board, chess.engine.Limit(depth=25), multipv=3)
best_moves = [pv["pv"][0].uci() for pv in info]
```

Determine which moves are "winning" -- typically all moves with evaluation
above a threshold (e.g., +2.0 or mate score) or the top MultiPV lines that
are within a small margin of the best.

### 5. Write the output (≈ 2 min)

```python
moves = set()  # deduplicate
# If multiple moves are within a small eval range, include all
with open("/app/move.txt", "w") as f:
    for m in moves:
        f.write(f"{m}\n")
```

### 6. Verify (≈ 2 min)

```bash
cat /app/move.txt
# Should contain at least one valid move like "e2e4"
python3 -c "
import chess
board = chess.Board('your-fen-here')
for line in open('/app/move.txt'):
    move = chess.Move.from_uci(line.strip())
    if move in board.legal_moves:
        print(f'Valid: {line.strip()}')
    else:
        print(f'INVALID: {line.strip()}')
"
```

## Verifier checklist

- [ ] `/app/move.txt` exists and is non-empty.
- [ ] Each line is a valid 4-character UCI move string (e.g., `e2e4`) or a
      promotion string (e.g., `e7e8q`).
- [ ] At least one move in the file is a correct best/winning move for the
      given position.
- [ ] All moves listed are legal in the position.

## Common pitfalls

1. **Misidentifying the side to move.** The task states "white to move."
   If your board recognizer doesn't detect the side to move correctly, or
   you assume it from the FEN's active color field, you might analyze from
   Black's perspective and suggest a Black move. Always verify the active
   color is `w` in your FEN.
2. **Board orientation error.** If the image shows the board from Black's
   perspective but your recognizer assumes White's, all coordinates will be
   mirrored (a1 becomes h8, etc.). Check whether the white pieces are at the
   bottom of the image (standard for White's perspective).
3. **Inadequate search depth.** A shallow search (depth < 15) may miss tactics
   and return a suboptimal move. The task expects the objectively best move,
   which requires at least depth 20-25 with Stockfish.
4. **Writing only one move when multiple are equally best.** If the position
   has two moves with identical evaluation (e.g., +5.0 both), omitting one
   makes the verifier fail if it only checks the one you didn't include.
   Use MultiPV to detect all moves within a small eval window.
5. **Wrong move format.** The verifier expects UCI format: source square +
   destination square (e.g., `g1f3`). Do not use SAN (`Nf3`), FAN, or LAN
   formats. Promotions include the promotion piece: `e7e8q`.

## Reference pointers

- python-chess documentation: https://python-chess.readthedocs.io/
- Stockfish UCI protocol: https://github.com/official-stockfish/Stockfish
- UCI move format specification: moves are 4 or 5 characters (promotion).
- Inside the task container, `/app/chess_board.png` contains the position image
  and the verifier compares `/app/move.txt` against the ground-truth best move(s).
