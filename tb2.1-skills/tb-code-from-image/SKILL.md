---
name: tb-code-from-image
description: Extract pseudocode from an image, implement the intended logic, and produce the correct output value. Use this skill whenever the task mentions reading code from an image, OCR for pseudocode, implementing cryptographic or hashing logic from a screenshot, producing a single output value to `/app/output.txt`, or when the answer starts with `bee26a`. The skill covers: examining `/app/code.png`, using OCR (Tesseract) or vision analysis to extract the pseudocode, interpreting the intended algorithm (likely SHA-256 or similar hash-based computation), implementing it in any programming language, running it, and writing the result to `/app/output.txt`.
---

# tb-code-from-image

Read pseudocode from an image at `/app/code.png`, implement it in any
language, execute it, and write the resulting value to `/app/output.txt`.

## When this skill triggers

Use it when the user is dropped into the `code-from-image` Docker container
and needs to produce `/app/output.txt`. Do **not** use it for general OCR
tasks or code screenshots -- this is specifically about extracting algorithmic
pseudocode from a raster image, correctly interpreting its logic (which
involves cryptographic hashing operations), and producing the exact output
value that the pseudocode would compute.

## Goal (one sentence)

Extract the pseudocode from `/app/code.png`, implement the algorithm it
describes, run it, and write the printed output value to `/app/output.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/output.txt` | Single line containing the output value that the pseudocode would print. |

The correct answer starts with the hex prefix `bee26a` (given as a hint to
verify correctness).

## Recommended workflow

### 1. Examine the image (≈ 3 min)

```bash
# Check the image exists and its properties
file /app/code.png
python3 -c "from PIL import Image; img = Image.open('/app/code.png'); print(img.size, img.mode)"
```

If available, use a viewer or convert to text:
```bash
# Try OCR
tesseract /app/code.png /tmp/code_text
cat /tmp/code_text.txt
```

If Tesseract is not installed:
```bash
apt-get update && apt-get install -y tesseract-ocr
```

### 2. Extract the pseudocode (≈ 10 min)

The image contains pseudocode that likely describes:
- Input processing (reading a string or data).
- A series of cryptographic operations (SHA-256 or similar hashing).
- Some transformation or accumulation of hash values.
- A final print statement outputting a hex string.

OCR accuracy is critical -- misreading a single character can change the
algorithm. Tips:
- Preprocess the image: `convert /app/code.png -contrast -sharpen 0x1 /tmp/enhanced.png`
- Try multiple OCR engines or settings.
- Manually correct OCR errors by examining the image closely.
- If the image shows colored syntax or indentation, the pseudocode is likely
  Python-like or C-like.

### 3. Interpret and implement the algorithm (≈ 15 min)

Common patterns in this type of task:
```python
import hashlib

# The pseudocode likely does something like:
data = "some_initial_value"
for i in range(N):
    data = hashlib.sha256(data.encode()).hexdigest()
    # or similar repeated hashing with concatenation

result = data
print(result)  # Write this to /app/output.txt
```

Key clues:
- The hint says the answer starts with `bee26a`, which is a hex string --
  consistent with SHA-256 output.
- Look for loop counts, initial seed values, and how hashes are chained
  or accumulated.
- Watch for details like "first N bytes" of a hash, or "XOR of two hashes",
  or "truncated to K characters".

### 4. Implement in any language (≈ 10 min)

```python
#!/usr/bin/env python3

import hashlib

def compute():
    # Translate the pseudocode exactly
    # ...
    return result

if __name__ == "__main__":
    output = compute()
    print(output)
    with open("/app/output.txt", "w") as f:
        f.write(output)
```

Run it:
```bash
python3 /app/implement.py
```

### 5. Verify against the hint (≈ 2 min)

```bash
cat /app/output.txt
# Should start with "bee26a"
python3 -c "
with open('/app/output.txt') as f:
    val = f.read().strip()
assert val.startswith('bee26a'), f'Expected bee26a..., got {val[:20]}...'
print('PASS: prefix matches')
"
```

### 6. Iterate if needed (≈ 10+ min)

If the output doesn't start with `bee26a`:
- Re-check the OCR output for misread characters.
- Verify loop bounds (off-by-one is common).
- Check whether the hash output format is correct (lowercase hex? No spaces?).
- Ensure you're using the exact hash function specified (SHA-256 vs SHA-1 vs
  SHA-512 -- they produce different outputs).
- Verify concatenation order: `hash(a + b)` vs `hash(b + a)`.
- Check for any integer-to-string conversion details in the pseudocode.

## Verifier checklist

- [ ] `/app/output.txt` exists.
- [ ] The file contains a single line (the pseudocode's printed output).
- [ ] The output value is exactly correct (matches the hidden ground truth).
- [ ] The output starts with `bee26a` (given hint).

## Common pitfalls

1. **OCR misreading characters.** `O` vs `0`, `l` vs `1` vs `I`, `rn` vs `m`.
   Cryptographic constants and loop bounds are especially sensitive. If the
   output is wrong, double-check every character the OCR produced against
   the image itself.
2. **Wrong hash algorithm.** SHA-256 is the most likely candidate (outputs
   64 hex characters starting with various prefixes), but the pseudocode
   might use SHA-1 (40 chars), SHA-512/256, Blake2, or MD5 (32 chars).
   Match the output length as a clue.
3. **Loop iteration miscount.** Does the loop run `N` times or `N-1` times?
   Does it include or exclude the initial value? A one-iteration difference
   in a hash chain produces a completely different final hash.
4. **Encoding issues.** If the pseudocode hashes strings, the encoding matters:
   ASCII vs UTF-8, and whether a trailing newline is included in the hash
   input. Use `.encode('utf-8')` or `.encode('ascii')` consistently.
5. **Hash output format.** Some hash libraries return bytes, others return hex
   strings. If the pseudocode says "print hash(X)", it's typically the hex
   representation. Check whether uppercase or lowercase hex is expected.

## Reference pointers

- Python hashlib documentation: https://docs.python.org/3/library/hashlib.html
- Tesseract OCR: https://github.com/tesseract-ocr/tesseract
- SHA-256 specification: FIPS 180-4.
- Inside the task container, the verifier compares `/app/output.txt` against
  the expected output and checks the `bee26a` prefix.
