---
name: tb-extract-moves-from-video
description: Extract text commands from a Zork gameplay video via OCR/transcription and produce a formatted moves file. Use this skill whenever the task involves downloading a YouTube video, extracting on-screen text from video frames, transcribing gameplay commands, producing `/app/solution.txt` with one move per line in `'n'` or `'get bag'` format, or working inside the `extract-moves-from-video` Docker container. Also trigger when the user needs to run OCR on video content, parse retro text-adventure game output, or match moves against a ground-truth transcript with 90% accuracy.
---

# tb-extract-moves-from-video

Extract all player moves from a Zork gameplay video (`/app/video.mp4`) and
write them to `/app/solution.txt`, one per line, in canonical format. This is
one of the Terminal-Bench 2.1 task skills; the full task lives at
`tasks/extract-moves-from-video/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `extract-moves-from-video` Docker
container and needs to produce `/app/solution.txt` containing every move the
player typed in the Zork video. Do **not** use it for general video
transcription tasks — this is specifically about extracting short text
commands from a terminal-recorded gameplay video with tight accuracy
requirements.

## Goal (one sentence)

Download or process the provided Zork gameplay video, extract every text
command the player typed, and write them one per line to `/app/solution.txt`
with at least 90% accuracy against the ground truth.

## Required outputs

| File | Purpose |
|---|---|
| `/app/solution.txt` | One move per line, e.g. `'n'` or `'get bag'`, matching the player's exact input sequence. |

The verifier compares each line of `solution.txt` against the expected
transcript. Accuracy must meet or exceed 90%.

## Recommended workflow

### 1. Survey the input (≈ 2 min)

- Check that `/app/video.mp4` exists and is readable.
- Run `ffprobe /app/video.mp4` to understand the video's codec, resolution,
  frame rate, and duration.
- Determine if the video shows a terminal emulator with a retro font (likely
  for Zork) — this affects OCR strategy.

### 2. Plan the extraction pipeline (≈ 3 min)

Choose a strategy based on the video's characteristics:

- **Frame extraction + OCR**: Use `ffmpeg` to extract key frames, then run
  Tesseract or a similar OCR engine on each frame. Works well for
  terminal-recorded video with fixed character positions.
- **Audio transcription**: If the video includes keyboard sounds or voice-over,
  transcribe the audio with Whisper — but this is secondary to OCR.
- **Direct text overlay detection**: Some recordings have a text overlay of
  typed commands.

Zork moves are short strings like `n`, `s`, `e`, `w`, `take lamp`, `open
mailbox`, `get sword`. The player types these into a prompt. The video likely
shows a terminal with white/green text on a dark background.

### 3. Extract frames and OCR (≈ 15 min)

```bash
# Extract one frame per second (adjust based on video)
mkdir -p /tmp/frames
ffmpeg -i /app/video.mp4 -vf fps=1 /tmp/frames/frame_%04d.png

# Run OCR on each frame
for f in /tmp/frames/*.png; do
  tesseract "$f" stdout --psm 6 >> /tmp/raw_ocr.txt
done
```

Key OCR considerations:
- Use `--psm 6` (assume a uniform block of text) or `--psm 4` (single column)
  depending on the terminal layout.
- Pre-process frames: crop to the command-line area, threshold to black/white,
  and maybe invert colors for better Tesseract accuracy.
- The Zork terminal typically has a prompt like `>` where the player types.

### 4. Filter and clean the moves (≈ 10 min)

The raw OCR output will contain noise — game descriptions, room text, system
messages interleaved with player moves. You need to:

- Identify which lines are player input (usually after a prompt character like
  `>`).
- Strip whitespace and normalize case.
- Remove duplicate consecutive moves (OCR may capture the same frame multiple
  times, or the player's input stays visible between frames).
- Validate that each move looks like a plausible Zork command (short, no long
  narrative text).

Consider writing a small Python script at `/app/extract.py` to automate this
filtering.

### 5. Format and validate (≈ 5 min)

- Write one move per line to `/app/solution.txt`.
- Ensure the format matches exactly: lowercase, no extra punctuation, no
  quotes around the moves (unless the instruction says so).
- Count lines and compare against the approximate number of moves expected for
  the video duration.
- Manually spot-check a few entries against the video.

## Verifier checklist (must all pass)

- [ ] `/app/solution.txt` exists and is non-empty.
- [ ] Every line contains a single move in the format `'command'` or `command`.
- [ ] At least 90% of the extracted moves match the ground-truth transcript.
- [ ] No empty lines or spurious output mixed in with the moves.

## Common pitfalls

1. **OCR'ing the entire frame without cropping.** The game output text (room
   descriptions, "You are standing in an open field...") will pollute your
   results. Crop to only the command prompt area, or filter aggressively by
   line characteristics.
2. **Duplicate moves from consecutive frames.** If the video shows the same
   input for several seconds before the player presses Enter, naive OCR will
   count each frame as a separate move. Deduplicate consecutive identical
   lines.
3. **Missing the keyboard-input area entirely.** Some videos show the game on
   the upper half and the keyboard/input line on the bottom. If you OCR the
   wrong region, you get zero moves. Watch a few seconds of video first to
   locate the input line.
4. **Case and whitespace mismatch.** The verifier may be strict about
   formatting. "n" and "N" might be treated differently. Go lowercase unless
   the video shows otherwise, and trim all whitespace.
5. **Assuming audio is the primary source.** Zork is a text game; the video's
   main signal is visual. Audio transcription is a fallback, not the primary
   pipeline.

## Quick sanity test (run after writing)

```bash
# Check that solution.txt exists and has content
wc -l /app/solution.txt

# Spot-check 5 random lines
shuf -n 5 /app/solution.txt

# Verify format: each line should be a short command
awk 'length($0) > 50 {print "WARNING: long line:", NR, $0}' /app/solution.txt
```

## Reference pointers

- Tesseract OCR documentation: `man tesseract` and `--help-psm` for page
  segmentation modes.
- FFmpeg frame extraction: `ffmpeg -i video.mp4 -vf fps=N frames/out%04d.png`.
- The Zork command set is documented at various interactive fiction wikis —
  common commands include movement (`n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`,
  `up`, `down`, `in`, `out`), object interaction (`take`, `get`, `drop`,
  `open`, `close`, `read`, `look`, `examine`), and combat (`attack`, `kill`).
- The verifier evaluates against a ground-truth transcript; it may use
  Levenshtein distance or exact-match comparison.
