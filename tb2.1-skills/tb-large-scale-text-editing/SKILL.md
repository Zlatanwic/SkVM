---
name: tb-large-scale-text-editing
description: Transform a 1-million-row CSV file to match an expected output byte-for-byte using keystroke-efficient Vim macros (under 200 total keystrokes across three registers). Use this skill whenever the task involves headless Vim, macro recording via `setreg()`, bulk CSV transformation, byte-exact file matching, or creating a `/app/apply_macros.vim` script that runs as `vim -Nu NONE -n -Es`. Also trigger when the user references 1M-row CSV files, Vim macro golf, the constraint of only using `call setreg()` and `%normal! @a/@b/@c` commands, or the `vim -Nu NONE` headless invocation pattern. Do NOT use this for interactive Vim editing, sed/awk-based CSV transformation, or Python/pandas CSV processing.
---

# tb-large-scale-text-editing

Transform a 1-million-row CSV file into an exact byte-for-byte match of an
expected output using three Vim macros totaling under 200 keystrokes, run
headlessly via `vim -Nu NONE -n -Es`. This is one of the Terminal-Bench 2.1
task skills; the full task lives at `tasks/large-scale-text-editing/` in the
same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `large-scale-text-editing` Docker
container and needs to produce `/app/apply_macros.vim` that transforms
`/app/input.csv` into a byte-exact copy of `/app/expected.csv`. Do **not**
use it for general CSV manipulation, shell-based text processing, or any
approach that uses languages other than Vim macros.

## Goal (one sentence)

Write three Vim macros (registers a, b, c) with under 200 total keystrokes
that, when applied sequentially to a 1M-row CSV, produce a byte-for-byte
match of the expected output file.

## Required outputs

| File | Purpose |
|---|---|
| `/app/apply_macros.vim` | Vim script with exactly three `call setreg()` lines, three `%normal! @` lines, and a `:wq` or `:x` |
| `/app/input.csv` | After script execution, must match `/app/expected.csv` byte-for-byte |

The verifier runs the script headlessly, checks that Vim exits 0, and diffs
the result against `expected.csv`.

## Recommended workflow

### 1. Understand the transformation (≈ 10 min)

- Inspect the first few lines of both files:
  ```bash
  head -20 /app/input.csv
  head -20 /app/expected.csv
  ```
- Identify what changed between input and expected. Common patterns:
  - Column reordering
  - Date format changes
  - Field concatenation or splitting
  - Adding/removing header rows
  - Whitespace normalization
  - Character escaping (quotes, commas)
- Check for differences programmatically:
  ```bash
  diff <(head -5 /app/input.csv) <(head -5 /app/expected.csv)
  ```
- Count columns in both:
  ```bash
  head -1 /app/input.csv | awk -F',' '{print NF}'
  head -1 /app/expected.csv | awk -F',' '{print NF}'
  ```

### 2. Design the macros on a small sample (≈ 15 min)

Copy a small subset for rapid iteration:
```bash
head -100 /app/input.csv > /tmp/test.csv
```

Open interactively in Vim (with no vimrc for realistic testing):
```bash
vim -Nu NONE -n /tmp/test.csv
```

Design macros interactively:
- `qa` ... `q` to record macro `a`
- `qb` ... `q` to record macro `b`
- `qc` ... `q` to record macro `c`

Use `:reg a b c` to see the recorded keystrokes and count them.

**Critical constraint:** Total keystrokes across all three registers must
be under 200. Each character in the macro string counts — including
`<Esc>`, `<CR>`, `<C-v>`, etc.

### 3. Write the apply_macros.vim script (≈ 10 min)

The script can ONLY contain:
```vim
" Macro definitions
call setreg('a', "keystrokes_here")
call setreg('b', "keystrokes_here")
call setreg('c', "keystrokes_here")

" Apply macros to the entire file
:%normal! @a
:%normal! @b
:%normal! @c

" Save and exit
:wq
```

Key rules:
- Each `call setreg()` MUST be on a single line.
- No Vimscript functions, no `:!` shell commands, no `:py3` or other
  scripting language embeds.
- Macros can contain Vim normal-mode keystrokes and limited Ex commands
  like `:s/pattern/replacement/` (typed within the macro).
- Use `%normal!` (with `!`) to avoid remapping issues — `%normal!`
  runs the macro on every line without user-defined mappings.
- The file must end with `:wq` or `:x`.

### 4. Test on a small sample (≈ 5 min)

```bash
cp /app/input.csv /tmp/test.csv
vim -Nu NONE -n -Es /tmp/test.csv -S /app/apply_macros.vim
diff /tmp/test.csv <(head -100 /app/expected.csv)
```

If the diff is clean for the first 100 lines, proceed to full test.

### 5. Run on the full file (≈ 5 min)

```bash
cp /app/input.csv /tmp/full_test.csv
time vim -Nu NONE -n -Es /tmp/full_test.csv -S /app/apply_macros.vim
echo "Exit code: $?"
diff /tmp/full_test.csv /app/expected.csv && echo "MATCH" || echo "MISMATCH"
```

If it times out (>20 min), your macros are too expensive per line.
Optimize by:
- Avoiding operations that re-scan the entire file on each line.
- Using `:s/` inside macros sparingly — it parses the pattern on every
  invocation.
- Prefer atomic normal-mode operations (`dw`, `f,`, `x`) over Ex commands
  where possible.

## Verifier checklist (must all pass)

- [ ] `/app/apply_macros.vim` exists and contains only allowed commands:
  three `call setreg()`, three `%normal! @`, and `:wq`/`:x`.
- [ ] Each macro is non-empty.
- [ ] Total keystrokes across a, b, c are under 200.
- [ ] `vim -Nu NONE -n -Es /app/input.csv -S /app/apply_macros.vim` exits
  with code 0.
- [ ] After editing, `/app/input.csv` matches `/app/expected.csv`
  byte-for-byte (`diff` returns 0 or `cmp` succeeds).

## Common pitfalls

1. **Exceeding 200 keystrokes.** This is the hardest constraint. Count
   keystrokes ruthlessly: special keys like `<Esc>` often count as
   multiple characters in the register (`^[`). Use `:echo strlen(@a)`
   in Vim to get the exact byte count. Minimize by combining operations
   and avoiding verbose Ex commands.
2. **Macro contains illegal commands.** Shell escapes (`:!`), Vimscript
   function calls, Python/Perl/Ruby embeds (`:py3`, `:perl`), and
   external tool invocations are all prohibited. The verifier checks the
   script content for disallowed patterns.
3. **Byte-exact match failure.** Even a single trailing space or newline
   difference causes failure. Use `cmp` (not `diff`) for byte-level
   comparison. Watch for: trailing whitespace, BOM characters, CRLF vs
   LF line endings, and quote escaping differences.
4. **Macro does nothing on empty lines or edge rows.** Macros recorded on
   one row shape may fail silently on rows with different structure
   (e.g., fewer commas, quoted fields containing commas). Test on a
   diverse sample, not just the first 10 rows.
5. **Running the macro on the header row.** If transformation differs
   between header and data rows, your macros must handle this. Either
   skip the first line (use `:2,$normal! @a`) or include a conditional
   check within the macro.

## Quick sanity test (run after writing the script)

```bash
# Copy input to a test location
cp /app/input.csv /tmp/sanity_test.csv

# Run the Vim script
vim -Nu NONE -n -Es /tmp/sanity_test.csv -S /app/apply_macros.vim
echo "Exit: $?"

# Byte-exact comparison
cmp /tmp/sanity_test.csv /app/expected.csv && echo "PASS" || echo "FAIL"

# Count macro keystrokes
vim -Nu NONE -n -Es -c "
call setreg('a', 'FIXME')
call setreg('b', 'FIXME')
call setreg('c', 'FIXME')
echo 'a:' . strlen(@a) . ' b:' . strlen(@b) . ' c:' . strlen(@c)
echo 'total:' . (strlen(@a) + strlen(@b) + strlen(@c))
q" --not-a-term /dev/null
```

## Reference pointers

- Vim `setreg()` documentation: `:help setreg()`
- Vim `%normal!` documentation: `:help :normal`
- The `-Nu NONE` flags: no vimrc, no plugins. `-n` disables swap files.
  `-Es` starts in silent Ex mode.
- Inside the task container, the verifier at the task root is the ground
  truth for what is scored.
