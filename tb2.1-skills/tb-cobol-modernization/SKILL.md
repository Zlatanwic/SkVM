---
name: tb-cobol-modernization
description: Reverse-engineer and reimplement a COBOL program's business logic in Python with exact output reproduction. Use this skill whenever the task mentions COBOL to Python migration, reading and understanding COBOL code in GnuCOBOL, reimplementing legacy business logic, ensuring `.DAT` file output parity, compiling and running a `.cbl` file with `cobc`, or producing `/app/program.py` that produces identical `ACCOUNTS.DAT`, `BOOKS.DAT`, and `TRANSACTIONS.DAT` files. The skill covers: reading COBOL syntax for data division, file I/O, and procedure division, compiling with GnuCOBOL 3, running the original to capture reference outputs, reimplementing the logic in Python, and diff-based verification.
---

# tb-cobol-modernization

Reimplement a COBOL program (`/app/src/program.cbl`) in Python, ensuring the
resulting Python script modifies `/app/data/ACCOUNTS.DAT`, `BOOKS.DAT`, and
`TRANSACTIONS.DAT` identically to the COBOL original.

## When this skill triggers

Use it when the user is dropped into the `cobol-modernization` Docker container
and needs to produce `/app/program.py`. Do **not** use it for general COBOL
compilation questions or greenfield Python development -- this is specifically
about reading a legacy COBOL program, understanding its business logic (file
I/O, record processing, data manipulation), and producing a byte-for-byte
equivalent Python reimplementation.

## Goal (one sentence)

Produce `/app/program.py` that reads `/app/src/INPUT.DAT`, processes the data
files in `/app/data/`, and produces `ACCOUNTS.DAT`, `BOOKS.DAT`, and
`TRANSACTIONS.DAT` that are identical to those produced by compiling and
running the original `program.cbl` with GnuCOBOL 3.

## Required outputs

| File | Purpose |
|---|---|
| `/app/program.py` | Python reimplementation of the COBOL program's logic. |
| `/app/data/ACCOUNTS.DAT` | Modified data file, identical to COBOL output. |
| `/app/data/BOOKS.DAT` | Modified data file, identical to COBOL output. |
| `/app/data/TRANSACTIONS.DAT` | Modified data file, identical to COBOL output. |

## Recommended workflow

### 1. Survey the environment and understand the COBOL source (≈ 10 min)

```bash
# Check GnuCOBOL availability
cobc --version

# Read the COBOL source
cat /app/src/program.cbl

# Understand the data files
ls -la /app/data/
cat /app/src/INPUT.DAT

# Check if there's a Makefile or build script
ls /app/
```

### 2. Compile and run the original COBOL program (≈ 5 min)

```bash
cd /app
cobc -x -o program src/program.cbl
./program
```

Save the reference output:
```bash
cp /app/data/ACCOUNTS.DAT /tmp/ACCOUNTS.DAT.ref
cp /app/data/BOOKS.DAT /tmp/BOOKS.DAT.ref
cp /app/data/TRANSACTIONS.DAT /tmp/TRANSACTIONS.DAT.ref
sha256sum /tmp/*.ref
```

### 3. Reverse-engineer the COBOL logic (≈ 15 min)

Key COBOL concepts to translate:
- **IDENTIFICATION DIVISION / DATA DIVISION**: Defines file structures and
  record layouts. Map each `FD` (File Description) and `01` record to
  Python data structures.
- **PROCEDURE DIVISION**: The actual program logic. Translate paragraph by
  paragraph:
  - `OPEN INPUT/OUTPUT/I-O` -> Python `open()` calls.
  - `READ ... INTO` -> file reading loops.
  - `WRITE` / `REWRITE` -> file writing.
  - `MOVE ... TO ...` -> assignment.
  - `ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE` -> arithmetic.
  - `IF ... ELSE` -> conditional logic.
  - `PERFORM ... VARYING` -> `for` / `while` loops.
  - `COMPUTE` -> expression evaluation.
  - `STRING` -> string concatenation/formatting.

Look for:
- Fixed-width record formats (COBOL files often use fixed-length records).
- Numeric formats like `PIC 9(5)V99` (5 digits + 2 decimal places).
- `PIC X(n)` fields (character strings of length n).
- File organization: sequential, indexed, or relative.

### 4. Implement the Python equivalent (≈ 15 min)

Structure the Python script:
```python
#!/usr/bin/env python3
"""Reimplementation of program.cbl in Python."""

def read_input_dat(path: str) -> dict:
    """Parse /app/src/INPUT.DAT."""
    ...

def read_accounts(path: str) -> list:
    """Parse ACCOUNTS.DAT with its record layout."""
    ...

def process_transactions(accounts, books, transactions, input_data):
    """Core business logic from COBOL PROCEDURE DIVISION."""
    ...

def write_outputs(accounts, books, transactions):
    """Write data files with exact same format as COBOL."""
    ...

def main():
    # Read inputs
    input_data = read_input_dat("/app/src/INPUT.DAT")
    accounts = read_accounts("/app/data/ACCOUNTS.DAT")
    books = read_books("/app/data/BOOKS.DAT")
    transactions = read_transactions("/app/data/TRANSACTIONS.DAT")

    # Process
    process_transactions(accounts, books, transactions, input_data)

    # Write outputs
    write_outputs(accounts, books, transactions)

if __name__ == "__main__":
    main()
```

### 5. Verify output parity (≈ 5 min)

```bash
# Reset data files to original state
cp /tmp/ACCOUNTS.DAT.ref /app/data/ACCOUNTS.DAT
cp /tmp/BOOKS.DAT.ref /app/data/BOOKS.DAT
cp /tmp/TRANSACTIONS.DAT.ref /app/data/TRANSACTIONS.DAT

# Run the Python script
python3 /app/program.py

# Compare outputs
diff /tmp/ACCOUNTS.DAT.ref /app/data/ACCOUNTS.DAT
diff /tmp/BOOKS.DAT.ref /app/data/BOOKS.DAT
diff /tmp/TRANSACTIONS.DAT.ref /app/data/TRANSACTIONS.DAT
```

If diffs appear, they are usually one of:
- Wrong field widths in output (off-by-one in COBOL PIC clause interpretation).
- Different newline or padding conventions.
- Incorrect arithmetic rounding (COBOL uses specific rounding rules).
- Different handling of blank/zero numeric fields.

### 6. Iterate until zero diffs (≈ 10+ min)

Hex-dump the outputs to see exact byte differences:
```bash
xxd /tmp/ACCOUNTS.DAT.ref > /tmp/ref.hex
xxd /app/data/ACCOUNTS.DAT > /tmp/out.hex
diff /tmp/ref.hex /tmp/out.hex
```

## Verifier checklist

- [ ] `/app/program.py` exists and runs without errors.
- [ ] The script reads from `/app/src/INPUT.DAT`.
- [ ] Running `python3 /app/program.py` modifies the data files in `/app/data/`.
- [ ] The resulting `ACCOUNTS.DAT` is identical to the COBOL-produced version.
- [ ] The resulting `BOOKS.DAT` is identical to the COBOL-produced version.
- [ ] The resulting `TRANSACTIONS.DAT` is identical to the COBOL-produced version.

## Common pitfalls

1. **Fixed-width record format mismatches.** COBOL programs typically use
   fixed-width records (e.g., 80 bytes per line). Python's default text I/O
   uses variable-length lines. If the COBOL writer pads with spaces to a
   fixed width, your Python output must match exactly -- pad with the same
   character to the same length.
2. **Numeric format misinterpretation.** COBOL's `PIC 9(5)V99` means 5 integer
   digits and 2 decimal digits (the V is implied, not stored). Stored as 7
   digits without a decimal point. If you write `12.34` where COBOL writes
   `0001234`, the files won't match.
3. **Copying reference files incorrectly.** If you run the COBOL program,
   modify the data files, then save the "reference" -- you're saving the
   modified files, not the originals. Always copy the reference output
   BEFORE running your Python script, and reset the data files before each
   test.
4. **Newline conventions.** COBOL file I/O may use `\r\n` (Windows-style) or
   no explicit newline at all (record-based I/O). Check the reference files
   with `xxd` or `od -c` to determine the exact byte sequence.
5. **Not reading the full COBOL source.** COBOL programs often have `COPY`
   statements that include copybooks. Check for `COPY` directives and read
   any included files. If there are nested `PERFORM` paragraphs, trace the
   execution order carefully.

## Reference pointers

- GnuCOBOL documentation: https://gnucobol.sourceforge.io/
- COBOL data types reference: PIC clause formatting.
- The GnuCOBOL compiler: `cobc -x` compiles to an executable; `cobc -c` to
  object file (useful for understanding without running).
- Inside the task container, the verifier runs both the original COBOL and
  your Python script with fresh data files and compares the outputs byte-for-byte.
