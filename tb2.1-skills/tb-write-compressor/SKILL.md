---
name: tb-write-compressor
description: Reverse-engineer a custom compression format from a provided decompressor and write a compatible compressor that produces valid compressed output under a size constraint. Use this skill when the task mentions a decompressor (`/app/decomp.c`), writing a compressor, reverse-engineering a compression format, producing `/app/data.comp` under a byte-size limit (2500 bytes), or matching input to output through a black-box decompressor. Also trigger when the user references custom binary formats, compression algorithms, or the `cat data.comp | /app/decomp` verification pattern.
---

# tb-write-compressor

Reverse-engineer the compression format used by `/app/decomp` and write a
compatible compressor that produces a valid `/app/data.comp` file under 2500
bytes. This is a Terminal-Bench 2.1 task; the full task lives at
`tasks/write-compressor/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `write-compressor` Docker container
and needs to produce `/app/data.comp`. Do **not** use it for implementing a
general-purpose compressor (gzip, lz4, zstd) or for compression algorithm
design from scratch -- this is specifically about reverse-engineering an
existing custom format.

## Goal (one sentence)

Produce a compressed file (`data.comp`) under 2500 bytes such that
`cat data.comp | /app/decomp` outputs the exact content of `/app/data.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/data.comp` | Compressed version of `/app/data.txt`, at most 2500 bytes. When piped through `/app/decomp`, outputs `/app/data.txt` exactly. |

## Recommended workflow

### 1. Characterize the decompressor (≈ 5 min)

- Check what kind of program `decomp` is:
  ```bash
  file /app/decomp
  strings /app/decomp
  ```
- Read the source: `/app/decomp.c`. The source is provided -- study it carefully
  to understand the compression format without needing to fully reverse-engineer
  the binary.
- Identify the decompression algorithm:
  - Is it LZ77/LZSS-based? (distance-length pairs)
  - Is it Huffman coding?
  - Is it a simple run-length encoding (RLE)?
  - Is it a dictionary-based scheme?
  - Is it a custom bytecode/opcode format?

### 2. Understand the format by reading decomp.c (≈ 10 min)

Key things to extract from `decomp.c`:
1. **Header format**: Does the compressed file start with a magic number, size,
   or any metadata?
2. **Opcode/command structure**: How does the decompressor interpret each byte
   or sequence of bytes? Look for `switch` statements, `if` branches on byte
   values, or bit-level operations.
3. **Literal encoding**: How are raw (uncompressed) bytes encoded?
4. **Back-reference encoding**: How are repeated sequences encoded (distance,
   length)?
5. **End-of-stream marker**: How does the decompressor know it is done?

### 3. Reverse-engineer the compression scheme (≈ 15 min)

Work backwards from `decomp.c`:

- **Read mode**: The decompressor reads from stdin byte by byte (or in chunks).
  Trace how each byte is consumed and what output it produces.
- **Build a mental model**:
  - For LZ77-like: a bit or byte signals literal vs back-reference. Literal
    means "copy the next N bytes directly". Back-reference means "copy N bytes
    from D positions back in the output".
  - For Huffman: the first part of the file may be a frequency table or tree
    description, followed by encoded bits.
  - For RLE: a count byte followed by the byte to repeat.

### 4. Implement the compressor (≈ 20 min)

Write a compressor that:
1. Reads `/app/data.txt` into memory.
2. Finds repeated substrings (for LZ-like) or runs (for RLE) or computes
   frequencies (for Huffman).
3. Emits the compressed representation matching the format expected by `decomp`.
4. Ensures output is <= 2500 bytes.

Key optimization: you must find good compression opportunities. Use a greedy
or hash-based matching algorithm:
- For LZ-like: use a hash table mapping 3-byte sequences to their most recent
  positions. At each position, find the longest match in the sliding window.
- For RLE: scan for runs of identical bytes.
- For dictionary: identify the most frequent substrings worth encoding.

### 5. Test and iterate (≈ 15 min)

```bash
# Compile and test
gcc -o compress compress.c  # or python3 compress.py
./compress < /app/data.txt > /app/data.comp

# Verify round-trip
cat /app/data.comp | /app/decomp > /tmp/roundtrip.txt
diff /app/data.txt /tmp/roundtrip.txt

# Check size
ls -la /app/data.comp
```

If size > 2500 bytes:
- Does the format allow longer back-references? Adjust matching to prefer fewer,
  longer references.
- Can you use a more aggressive match-finding strategy?
- Is there an unused flag/encoding that could reduce overhead?

If output doesn't match:
- Trace the decompressor with your compressed file to find where interpretation
  diverges. Use `strace` or insert debug prints in a copy of `decomp.c`.
  ```bash
  # Compile decomp with debug
  gcc -g -o /tmp/decomp_dbg /app/decomp.c
  gdb --args /tmp/decomp_dbg < /app/data.comp
  ```

## Verifier checklist (must all pass)

- [ ] `/app/data.comp` exists.
- [ ] File size <= 2500 bytes.
- [ ] `cat /app/data.comp | /app/decomp` produces output identical to `/app/data.txt`.
- [ ] Decompressor exits cleanly (return code 0).

## Common pitfalls

1. **Not reading `decomp.c` carefully enough.** The source code is provided.
   Every ambiguity about the format can be resolved by reading the decompressor
   code. Don't guess -- trace the code. Pay special attention to bit-level
   operations, shift amounts, and endianness.
2. **Off-by-one errors in length/distance encoding.** Many compression formats
   encode (length - minimum_match_length) or (distance - 1) to save bits. If your
   compressor emits the raw value rather than the adjusted value, the decompressor
   will produce the wrong output or crash.
3. **Not handling edge cases.** What if there are no repeats? What if the entire
   file is the same byte? The decompressor likely handles these, but your
   compressor must produce valid output for all cases. Test with small,
   carefully constructed inputs before the full `data.txt`.
4. **Producing output larger than 2500 bytes.** The compression format may have
   per-reference overhead (e.g., 2 bytes per back-reference). If your matches
   are too short, the overhead exceeds the savings. Aim for matches of at least
   3-4 bytes to be net-positive. Greedy longest-match is usually better than
   fastest-match.
5. **End-of-stream handling.** Forgetting the end-of-stream marker or emitting
   the wrong one results in the decompressor either hanging (waiting for more
   input) or producing extra output. The decompressor source shows exactly what
   terminates decompression.

## Reference pointers

- The decompressor source at `/app/decomp.c` is the definitive specification of
  the compression format.
- `/app/data.txt` contains the text to compress; analyze its structure (repeated
  words, phrases, patterns) to inform your matching strategy.
- Standard compression reverse-engineering technique: compile `decomp.c` with
  debug symbols, run under `gdb`, and step through with known inputs to
  understand the format.
- `xxd` or `hexdump -C` to inspect the raw bytes of any test compressed files.
