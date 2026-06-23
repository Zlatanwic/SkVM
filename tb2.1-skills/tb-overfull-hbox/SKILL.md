---
name: tb-overfull-hbox
description: Fix all "overfull hbox" warnings in a LaTeX document by substituting words in `input.tex` with allowed synonyms from `synonyms.txt`, without editing `main.tex` or `synonyms.txt`. Use this skill whenever the task mentions LaTeX compilation, overfull hbox warnings, pdflatex, word substitution, synonym-based reflow, or constrained text editing to eliminate line-overflow warnings. Also trigger when the user references the `overfull-hbox` Docker container or asks to fix TeX layout warnings via text replacement.
---

# tb-overfull-hbox

Eliminate every "overfull hbox" warning from a LaTeX document by replacing words
in `input.tex` with allowed synonyms from a `synonyms.txt` file, without
modifying `main.tex` or the synonym file itself. This is a Terminal-Bench 2.1
debugging task; the full task spec lives at `tasks/overfull-hbox/` in the repo.

## When this skill triggers

Use it when the user is dropped into the `overfull-hbox` Docker container and
needs to produce a warning-free `pdflatex` compilation of `main.tex`. The only
permitted edits are synonym substitutions in `input.tex`. Do **not** use it for
general LaTeX formatting, margin adjustments, font changes, or `\sloppy`
workarounds — the solution must come from word substitutions alone.

## Goal (one sentence)

Compile `main.tex` with `pdflatex` such that zero "overfull hbox" warnings
appear in the log, by replacing words in `input.tex` with their allowed
synonyms listed in `synonyms.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `input.tex` | Modified version where some words have been replaced by permitted synonyms. Must differ from the original only by synonym substitutions. |
| `main.tex` | Unchanged — must remain exactly as provided. |
| `synonyms.txt` | Unchanged — must remain exactly as provided. |
| `main.pdf` | (Implicit) Successfully compiled PDF with no overfull hbox warnings. |

The verifier compiles `main.tex` with `pdflatex` and scans the log for
"overfull hbox" warnings. It also verifies that `main.tex` and `synonyms.txt`
are unmodified and that only allowed word substitutions were made in
`input.tex`.

## Recommended workflow

### 1. Survey the files and understand the problem (≈ 3 min)

- Read `main.tex` to understand the document structure — it likely
  `\input{input.tex}` to pull in the body text.
- Read `synonyms.txt` to catalog every allowed substitution. Each line
  defines a family of interchangeable words.
- Read `input.tex` to see the text that is causing overfull boxes.
- Run an initial compilation to count the warnings:

```bash
pdflatex -interaction=nonstopmode main.tex | grep -c "overfull"
```

### 2. Identify the overfull lines (≈ 3 min)

```bash
pdflatex -interaction=nonstopmode main.tex 2>&1 | grep -A2 "Overfull"
```

Each warning tells you which line of `input.tex` is too long and by how many
points. Map the line numbers back to the source.

### 3. Plan substitutions (≈ 5 min)

For each overfull line, survey the allowed synonym families in `synonyms.txt`:

- A longer word can be replaced with a shorter synonym in the same family.
- Make the minimum number of substitutions needed — unnecessary changes risk
  introducing new overfull boxes elsewhere or breaking the verifier's edit
  check.
- Changing one word may reflow subsequent lines, fixing or creating warnings
  downstream. Recompile after each batch of changes to check progress.

### 4. Apply substitutions iteratively (≈ 15 min)

```bash
# Edit input.tex, replacing words with shorter synonyms
# Recompile after each batch
pdflatex -interaction=nonstopmode main.tex 2>&1 | grep -c "overfull"
```

Work through the document paragraph by paragraph. A substitution that shortens
one line may cause the next line to become overfull if the shorter word pulls
text upward. Track the overfull count at each iteration.

### 5. Verify zero warnings (≈ 2 min)

```bash
pdflatex -interaction=nonstopmode main.tex 2>&1 | grep -i "overfull"
# Should produce no output
```

## Verifier checklist

- [ ] `main.tex` is byte-for-byte identical to the original.
- [ ] `synonyms.txt` is byte-for-byte identical to the original.
- [ ] Every word in `input.tex` is either original or a valid synonym from the same family.
- [ ] `pdflatex` compiles `main.tex` with zero "overfull hbox" warnings.
- [ ] No structural LaTeX changes — only word substitutions.

## Common pitfalls

1. **Editing `main.tex` or `synonyms.txt`.** The verifier checks that both
   files are untouched. All edits must go into `input.tex` only. Even
   whitespace changes to `main.tex` will cause a failure.
2. **Using a word not in the synonym family.** If `synonyms.txt` lists
   `{house, home, dwelling}`, you can replace "house" with "home" or
   "dwelling", but you cannot replace it with "building" unless it is in
   the same brace-delimited family. The verifier validates every substitution.
3. **Assuming a single pass will work.** Replacing a long word with a short
   one pulls text backward, which can create a new overfull box on a
   previously clean line. This is an iterative, combinatorial problem — plan
   for multiple compile-check-edit cycles.
4. **Ignoring the knock-on effects of punctuation and kerning.** TeX's
   line-breaking algorithm considers hyphenation, ligatures, and glue. A
   substitution that saves 3 characters may not save exactly 3 characters of
   line width. Test each change.
5. **Not checking all warnings before declaring success.** `grep -c "overfull"`
   catches the exact phrase, but `grep -i "overfull"` is safer. Some TeX
   distributions capitalize differently or embed the warning in longer messages.

## Reference pointers

- Donald Knuth's *The TeXbook* for understanding the hbox-overfull mechanism.
- The `pdflatex` log format: lines containing "Overfull \hbox" include the
  line number and the amount of overflow in points.
- Inside the task container, the verifier at `tests/test_outputs.py` defines
  exactly what constitutes a passing run.
- Task spec: `tasks/overfull-hbox/instruction.md`.
