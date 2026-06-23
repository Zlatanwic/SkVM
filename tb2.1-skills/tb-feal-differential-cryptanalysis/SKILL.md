---
name: tb-feal-differential-cryptanalysis
description: Implement a chosen-plaintext differential cryptanalysis attack on a FEAL-like cipher to recover key[5] as a uint32. Use this skill whenever the task mentions FEAL cipher analysis, differential cryptanalysis, chosen-plaintext attacks, recovering round keys from a Python encryption oracle, implementing `attack(encrypt_fn)` in `/app/attack.py`, or working inside the `feal-differential-cryptanalysis` Docker container. Also trigger when the user needs to find high-probability differential characteristics, exploit XOR differences across FEAL rounds, or crack the 16-bit round-key subkey space via differential trails without brute-forcing all 2^96 keys.
---

# tb-feal-differential-cryptanalysis

Implement a chosen-plaintext differential attack against a FEAL-like cipher
(`/app/feal.py`) and recover `key[5]` as a uint32, with the attack completing
within 30 seconds. This is one of the Terminal-Bench 2.1 task skills; the full
task lives at `tasks/feal-differential-cryptanalysis/` in the same repo as
this skill.

## When this skill triggers

Use it when the user is dropped into the `feal-differential-cryptanalysis`
Docker container and needs to deliver `/app/attack.py` with an `attack(encrypt_fn)`
function that returns the uint32 value of `key[5]`. Do **not** use it for
generic block-cipher cryptanalysis — this is specifically about exploiting
differential characteristics in a FEAL-like Feistel network with known round
key derivation (6 round keys from 16-bit seeds each).

## Goal (one sentence)

Recover the fifth round key of a FEAL-like cipher by finding and exploiting a
high-probability differential characteristic through chosen-plaintext queries
to the encryption oracle.

## Required outputs

| File | Purpose |
|---|---|
| `/app/attack.py` | Must define `attack(encrypt_fn)` that takes an encryption function and returns the uint32 value of `key[5]`. Must complete in under 30 seconds. |

The verifier calls `attack(encrypt_fn)` with a freshly seeded cipher instance
and checks that the returned value matches the internal `key[5]`.

## Recommended workflow

### 1. Understand the cipher structure (≈ 10 min)

- Open `/app/feal.py` and map out the Feistel network: number of rounds,
  round function details, key schedule, and S-boxes (if any).
- Identify the block size (likely 64-bit), the round key derivation from
  16-bit seeds, and how `key[5]` is used in the encryption process.
- Confirm that `encrypt_fn(plaintext: int) -> int` takes and returns integers,
  likely with fixed block width.

### 2. Study differential cryptanalysis theory (≈ 15 min)

Key concepts to review:
- **XOR differential**: The difference between two plaintexts `P ⊕ P'` and how
  it propagates through Feistel rounds.
- **Differential characteristic**: A sequence of round differences `(ΔP, ΔA,
  ΔB, ..., ΔC)` with associated probability.
- **Last-round attack**: Recover the final round key by guessing subkey bits
  and checking whether the output difference matches the predicted
  characteristic.
- **Signal-to-noise ratio**: Ensure enough right pairs survive filtering so
  that the correct subkey emerges above the noise.

### 3. Find a good differential (≈ 20 min)

Write analysis code to:

```python
# Study the round function's differential behavior
def analyze_round_function():
    # Test how input differences propagate through the F-function
    # Look for high-probability transitions (e.g., identity mappings,
    # zero outputs, or low-Hamming-weight outputs)
    ...
```

For FEAL-like ciphers:
- The round function typically involves byte rotations, XOR with round keys,
  and S-box lookups.
- Look for differentials where the F-function output difference is zero (the
  "trivial" one-round characteristic with probability 1).
- Common FEAL differentials exploit the XOR-linear components and the
  specific structure of the G-function.
- A 3-round or 4-round iterative characteristic can be extended to cover 6
  rounds.

### 4. Implement the attack (≈ 30 min)

```python
# /app/attack.py

def attack(encrypt_fn):
    # 1. Find a high-probability differential (ΔP → ΔC) covering
    #    rounds 1 through R-1 (leaving the last round for key recovery).
    #
    # 2. Generate N chosen plaintext pairs with the input difference.
    #
    # 3. For each candidate value of key[5] (there are 2^16 of them):
    #    a. Partially decrypt the last round for both ciphertexts.
    #    b. Check if the resulting difference matches the expected
    #       penultimate-round difference.
    #    c. Increment a counter for each candidate subkey that
    #       produces the expected difference.
    #
    # 4. The candidate with the highest counter is key[5].

    key5 = ...  # Recovered uint32 value
    return key5
```

Key implementation details:
- The subkey space is 16 bits per round key (6 round keys total) — the attack
  should exploit this limited subkey size.
- Brute-forcing `2^16 = 65536` candidates for the last round key is fast, so
  focus on generating enough right pairs for the counter to be unambiguous.
- Use the XOR difference between ciphertexts to verify your differential
  characteristic.

### 5. Tune for the 30-second limit (≈ 10 min)

- Profile your attack: how many chosen-plaintext pairs do you need? Can you
  reduce the number by using a higher-probability differential?
- If the differential probability is `p`, you need roughly `O(1/p)` pairs to
  get at least one right pair. For a subkey counter attack, aim for 5--10
  right pairs.
- Cache repeated computations. Avoid re-deriving the differential
  characteristic inside the counting loop.

### 6. Verify (≈ 2 min)

```bash
cd /app && python -c "
from attack import attack
from feal import FEAL
key = 12345
cipher = FEAL(key)
recovered = attack(cipher.encrypt)
print('Recovered:', recovered)
print('Expected:', cipher.key[5] if hasattr(cipher, 'key') else '?')
"
```

## Verifier checklist (must all pass)

- [ ] `/app/attack.py` exists and imports cleanly.
- [ ] `attack(encrypt_fn)` is defined and callable.
- [ ] `attack()` returns an integer value.
- [ ] The returned value matches `key[5]` within the verifier's tolerance.
- [ ] `attack()` completes in under 30 seconds.
- [ ] The attack does not brute-force the full keyspace (explicit check).

## Common pitfalls

1. **Brute-forcing the entire key instead of using differentials.** The task
   explicitly says "you still can't brute force the entire keyspace." The
   verifier likely checks runtime or that your code follows a differential
   approach. A naive `for key in range(2**96):` loop will time out.
2. **Wrong differential probability estimation.** If your characteristic has
   probability too low, you will never see a right pair within a reasonable
   number of queries. Empirically verify your differential by generating pairs
   and checking the output difference distribution.
3. **Confusing which round key to recover.** The task asks for `key[5]`, which
   is the 6th round key (0-indexed). Make sure you are attacking the correct
   round — recovering the wrong round key wastes all your effort.
4. **Not handling the Feistel structure correctly in partial decryption.**
   In the last round of a Feistel network, only one half of the block goes
   through the F-function. Your partial decryption must match the cipher's
   exact round structure.
5. **Ignoring key schedule interactions.** The 16-bit seed per round key is a
   hint. Your attack only needs to recover one 16-bit subkey, not the master
   key. The limited subkey space makes the counting attack practical with few
   right pairs.

## Quick sanity test (run after writing)

```python
# Verify your differential empirically
import feal  # or however the module is named
c1 = feal.FEAL(seed=42)
pairs = [(p, p ^ diff) for p in ...]
counts = ...
# Check that output differences concentrate on your predicted value
```

## Reference pointers

- Biham, E., & Shamir, A. (1991). Differential cryptanalysis of FEAL and
  N-Hash. *EUROCRYPT '91*. The foundational paper.
- Biham, E., & Shamir, A. (1992). *Differential Cryptanalysis of the Data
  Encryption Standard*. Springer-Verlag. Chapters on FEAL are directly
  applicable.
- The code in `/app/feal.py` is the ground truth — study it before designing
  your differential.
- The FEAL round function typically uses byte rotations, XOR, and a simple
  non-linear function (the G-function). Understanding this is essential for
  computing differential probabilities.
