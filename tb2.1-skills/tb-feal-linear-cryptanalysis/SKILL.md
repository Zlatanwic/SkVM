---
name: tb-feal-linear-cryptanalysis
description: Implement a known-plaintext linear cryptanalysis attack on a FEAL-like cipher to recover encryption keys and decrypt ciphertexts. Use this skill whenever the task mentions FEAL linear cryptanalysis, known-plaintext attacks, recovering keys from plaintext-ciphertext pairs, implementing linear approximations to extract round keys, producing `/app/plaintexts.txt` from `/app/ciphertexts.txt`, or working inside the `feal-linear-cryptanalysis` Docker container. Also trigger when the user needs to exploit linear bias in S-boxes, perform Matsui's Algorithm 1 or 2, or recover keys from a C-implemented FEAL cipher with 4 round keys derived from 20-bit seeds.
---

# tb-feal-linear-cryptanalysis

Implement a known-plaintext linear cryptanalysis attack against a FEAL-like
cipher implemented in C, recover the encryption key from 32 plaintext-ciphertext
pairs in `/app/pairs.txt`, and decrypt all ciphertexts in
`/app/ciphertexts.txt`. This is one of the Terminal-Bench 2.1 task skills; the
full task lives at `tasks/feal-linear-cryptanalysis/` in the same repo as this
skill.

## When this skill triggers

Use it when the user is dropped into the `feal-linear-cryptanalysis` Docker
container and needs to recover the FEAL key from known plaintext-ciphertext
pairs and produce `/app/plaintexts.txt`. Do **not** use it for differential
cryptanalysis tasks — linear cryptanalysis uses a fundamentally different
statistical approach (linear approximations of non-linear components rather
than difference propagation).

## Goal (one sentence)

Recover the FEAL cipher key by constructing a linear approximation that biases
the XOR sum of selected plaintext, ciphertext, and key bits, then use the
recovered key to decrypt all ciphertexts in `/app/ciphertexts.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/plaintexts.txt` | Decrypted versions of all ciphertexts in `/app/ciphertexts.txt`, one per line, proving key recovery. |

The verifier checks that decrypting `/app/ciphertexts.txt` with the recovered
key produces the correct plaintexts.

## Recommended workflow

### 1. Study the provided materials (≈ 10 min)

- Read `/app/feal.c` to understand the encryption algorithm: round count,
  round function, S-box structure, key schedule.
- Read `/app/decrypt.c` — understanding the decryption function helps verify
  your recovered key is correct before writing output.
- Inspect `/app/pairs.txt` — count the pairs and confirm the format (likely
  hex-encoded plaintext and ciphertext per line).
- Each of the 4 round keys is derived from a 20-bit seed. The subkey space
  per round is 2^20 = ~1M, which linear cryptanalysis handles efficiently.

### 2. Design linear approximations (≈ 20 min)

Linear cryptanalysis core concepts:

- **Linear approximation**: A Boolean equation `(P · α) ⊕ (C · β) = (K · γ)`
  that holds with probability `p ≠ 1/2`. The bias `ε = |p - 1/2|` determines
  how many known plaintexts you need.
- **Piling-up lemma**: The bias of an XOR of independent approximations is
  `2^(n-1) ∏ ε_i`. Use this to combine round-level approximations into a
  multi-round approximation.
- **Matsui's Algorithm 1**: If you have a linear approximation covering R-1
  rounds, you can recover the last round key by partial decryption and
  counting.

Steps:
1. Analyze the FEAL S-box(es) to find high-bias linear approximations.
   For each S-box, compute the Linear Approximation Table (LAT):
   `LAT[a][b] = #{x: parity(x · a) = parity(S(x) · b)} - 2^(n-1)`.
2. Find the S-box approximation with the largest absolute bias.
3. Extend through the Feistel rounds using the piling-up lemma.
4. You need an approximation covering R-1 of the total rounds, leaving the
   last round for key recovery.

### 3. Implement the attack (≈ 30 min)

Write Python (or C) code to:

```python
# Pseudocode for linear attack on FEAL

# Step 1: Load known plaintext-ciphertext pairs
pairs = load_pairs("/app/pairs.txt")

# Step 2: For each candidate for the last round key (2^20 values):
#   - Partially decrypt one round
#   - Count how many times the linear approximation holds
#   - Track the absolute bias from 1/2 for each candidate

# Step 3: The candidate with the highest bias is correct

# Step 4: Work backwards through the key schedule to recover the master key
#   (or brute-force remaining unknown bits)

# Step 5: Use the recovered key and /app/decrypt.c logic to decrypt
#   /app/ciphertexts.txt
```

Key details:
- With 32 known pairs and a 20-bit subkey, linear cryptanalysis needs
  enough pairs for the bias to overcome the noise. Roughly `O(1/ε^2)` pairs
  are needed; for a bias of `ε = 0.1`, that is ~100 pairs. If you only have
  32, you need a stronger bias or must cascade approximations carefully.
- The attack can recover subkey bits incrementally — if you find one round
  key, the key schedule may reveal others.

### 4. Verify and decrypt (≈ 10 min)

```bash
# Test: decrypt a known pair from pairs.txt
python3 -c "
# Use recovered key to decrypt one known ciphertext
# Compare against the known plaintext
"

# Full decryption
python3 decrypt_all.py /app/ciphertexts.txt /app/plaintexts.txt
```

### 5. Write output (≈ 2 min)

- Ensure `/app/plaintexts.txt` has one plaintext per line in the same format
  as `/app/pairs.txt` (likely hex).
- Verify you can decrypt all ciphertexts without errors — each should produce
  readable plaintext, not garbage.

## Verifier checklist (must all pass)

- [ ] `/app/plaintexts.txt` exists and has the correct number of lines
      (matching `/app/ciphertexts.txt`).
- [ ] Each plaintext decrypts correctly using the recovered key.
- [ ] The key was recovered via linear cryptanalysis, not brute force.
- [ ] The attack uses the 32 known-plaintext pairs from `/app/pairs.txt`.

## Common pitfalls

1. **Confusing linear and differential cryptanalysis.** Linear cryptanalysis
   works with XOR sums of bits and statistical bias; differential works with
   XOR differences between pairs. Using differential techniques on a
   linear task (or vice versa) will fail.
2. **Computing the LAT incorrectly.** The Linear Approximation Table entry
   `LAT[a][b]` counts how many inputs `x` satisfy `parity(x & a) ==
   parity(S(x) & b)`. A common off-by-one is subtracting `2^(n-1)` (which
   centers the table around zero) inconsistently.
3. **Insufficient known-plaintext pairs for the bias.** If your approximation's
   bias is `ε = 0.03`, you need roughly `1/ε^2 ≈ 1111` pairs for the correct
   subkey to emerge clearly above noise. With only 32 pairs, you must find an
   approximation with `ε ≥ 0.18` or use a multi-stage recovery strategy.
4. **Forgetting the Feistel swap.** In a Feistel network, the left and right
   halves swap after each round (except sometimes the last). Getting the swap
   wrong means your partial decryption produces junk.
5. **Incorrect key schedule reversal.** Even after recovering all round keys,
   you must reverse the key schedule to get the master key for decryption.
   The 20-bit seed per round key constrains the problem but doesn't
   eliminate it.

## Quick sanity test (run after writing)

```bash
# After recovering the key, test against one known pair
python3 -c "
# Load one pair from pairs.txt
# Decrypt the ciphertext with your recovered key
# Compare against the known plaintext
# If it matches, proceed to bulk decryption
"
```

## Reference pointers

- Matsui, M. (1993). Linear cryptanalysis method for DES cipher. *EUROCRYPT '93*.
  The original paper that introduced linear cryptanalysis.
- Matsui, M. (1994). The first experimental cryptanalysis of the Data Encryption
  Standard. *CRYPTO '94*. Describes Algorithm 1 and Algorithm 2 in practical
  detail.
- The S-box analysis technique (LAT computation) is covered in most
  introductory cryptography texts, e.g., Stinson, D. R. *Cryptography: Theory
  and Practice*.
- `/app/feal.c` and `/app/decrypt.c` are the ground truth — all constants,
  round counts, and S-box definitions are definitive.
