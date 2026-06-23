---
name: tb-dna-insert
description: Design PCR primers for site-directed mutagenesis using NEB's Q5 site-directed mutagenesis kit to convert a circular input plasmid into a desired output plasmid. Use this skill whenever the task mentions designing primers for site-directed mutagenesis, Q5 mutagenesis kit, converting a plasmid sequence via mutagenesis, or producing a `primers.fasta` file with specific primer pair format requirements. Also trigger when the user references `sequences.fasta`, circular plasmid mutagenesis, primer design with annealing length 15-45 nt, Tm 58-72 degrees Celsius, or pair Tm difference ≤ 5 degrees Celsius. The skill covers: comparing input and output plasmid sequences to identify mutations, designing mutagenic primers with the desired changes, computing melting temperatures using primer3's oligotm, grouping primers by pairs, and formatting FASTA output.
---

# tb-dna-insert

Design PCR primers for NEB Q5 site-directed mutagenesis to convert a circular
input plasmid into the desired output plasmid (with insertions, deletions, or
substitutions), respecting primer length, Tm, and pair-matching constraints.
Output grouped primer pairs as a FASTA file. This is a Terminal-Bench 2.1 task;
the full task spec lives at `tasks/dna-insert/`.

## When this skill triggers

Use it when the user is dropped into the `dna-insert` Docker container and
needs to design mutagenesis primers to convert one plasmid into another. Do
**not** use it for Golden Gate assembly, Gibson assembly, or general PCR
amplification — this is specifically about site-directed mutagenesis using
the Q5 kit, where primers introduce specific mutations into a circular
plasmid template.

## Goal (one sentence)

Design the minimum number of primer pairs that, when used with NEB Q5
site-directed mutagenesis, convert the input plasmid into the output plasmid,
with primers meeting length (15-45 nt annealing), Tm (58-72 degrees Celsius),
and pair-difference (≤ 5 degrees Celsius) constraints.

## Required outputs

| File | Purpose |
|---|---|
| `/app/primers.fasta` | FASTA file with primer sequences grouped by pairs (forward listed first). No blank lines. Minimum number of primer pairs. |

Input: `/app/sequences.fasta` contains the input and output plasmid sequences
— do NOT modify.

## Recommended workflow

### 1. Analyze the sequences (≈ 5 min)

```bash
cat /app/sequences.fasta
```

Identify:
- **input**: The starting circular plasmid.
- **output**: The desired plasmid after mutagenesis.

Align the two sequences to find the differences:
```python
# Quick alignment to find mutations
def find_mutations(input_seq, output_seq):
    # For simple insertions/deletions/substitutions
    # Use pairwise alignment or direct comparison
    for i, (a, b) in enumerate(zip(input_seq, output_seq)):
        if a != b:
            print(f"Position {i}: {a} -> {b}")
    if len(input_seq) != len(output_seq):
        print(f"Length difference: {len(output_seq) - len(input_seq)} bp")
```

The mutation could be:
- **Substitution**: one or more bases changed.
- **Insertion**: new sequence added.
- **Deletion**: sequence removed.
- **Combination**: multiple changes across the plasmid.

### 2. Understand Q5 site-directed mutagenesis primer design (≈ 5 min)

NEB Q5 site-directed mutagenesis kit principles:

**For substitutions and deletions:**
- Primers are back-to-back (diverging), not overlapping.
- Forward primer: 5' end starts at the mutation site, extending in the
  forward direction.
- Reverse primer: 5' end starts just before the mutation site, extending
  in the reverse direction.
- The mutation is incorporated at the 5' end of one or both primers.

**For insertions:**
- The insertion sequence is added to the 5' end of one primer.
- The 3' end anneals to the template flanking the insertion site.

Key: the 5' ends of the two primers are adjacent (back-to-back) on the
circular plasmid — they point away from each other. The entire plasmid is
amplified, and the PCR product is circularized by phosphorylation + ligation.

### 3. Design the primers (≈ 15 min)

For each mutation site:

```
5' - [mutation sequence] [template-annealing region] - 3'  (forward)
5' - [mutation sequence] [template-annealing region] - 3'  (reverse)
```

Where:
- The 5' end carries the desired mutation (insertion, substitution, or the
  non-mutated flank for a deletion).
- The 3' annealing region (15-45 nt) binds to the input template.
- The two primers are back-to-back: the forward primer's 5' end is adjacent
  to the reverse primer's 5' end on the circular plasmid.

**Annealing region design:**
- Length: 15-45 nucleotides.
- Should have a GC content that yields Tm in the 58-72 degrees Celsius range.
- Both primers in a pair should have Tm within 5 degrees Celsius of each other.

**For multiple mutation sites:**
- If mutations are far apart, multiple primer pairs may be needed.
- If mutations are close, they can be combined into one pair.
- Use the minimum number of primer pairs.

### 4. Compute melting temperatures (≈ 10 min)

Use primer3's `oligotm` with the exact flags:
```python
import subprocess

def compute_tm(annealing_seq: str) -> float:
    result = subprocess.run(
        ["oligotm", "-tp", "1", "-sc", "1", "-mv", "50", "-dv", "2",
         "-n", "0.8", "-d", "500"],
        input=annealing_seq,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())
```

Only the annealing region (not the 5' mutation extension) contributes to Tm.

### 5. Iterate until constraints are met (≈ 10 min)

For each primer pair:
1. Extract the annealing region (the part complementary to the input template).
2. Compute Tm for forward and reverse annealing regions.
3. If Tm < 58 degrees Celsius: lengthen the annealing region.
4. If Tm > 72 degrees Celsius: shorten the annealing region.
5. Ensure |Tm_fwd - Tm_rev| ≤ 5 degrees Celsius.

Adjust the boundary between mutation sequence and annealing region. The
mutation can be split between the two primers or placed entirely on one.

### 6. Write the FASTA file (≈ 5 min)

```python
primers_pairs = [
    # Pair 1
    [(">input_fwd", "NNN...NNN"),
     (">input_rev", "NNN...NNN")],
    # Pair 2 (if needed)
    [(">input_fwd2", "NNN...NNN"),
     (">input_rev2", "NNN...NNN")],
]

with open("/app/primers.fasta", "w") as f:
    for pair in primers_pairs:
        for header, seq in pair:
            f.write(f"{header}\n{seq}\n")
```

Requirements:
- Primers grouped by pairs, forward primer listed first.
- No blank lines in the file.
- Minimum number of primer pairs.

Since both primers are for the input plasmid, the header format uses the
template name (the task says TEMPLATENAME can be `input`). Unlike the
dna-assembly task, the task spec here does not explicitly mandate a header
format with `_DIR`, but grouping by pairs with forward first is required.

### 7. Verify (≈ 3 min)

```bash
# Quick verification
python3 << 'EOF'
import subprocess

with open("/app/primers.fasta") as f:
    content = f.read()

assert "\n\n" not in content, "No blank lines"
lines = content.strip().split("\n")

# Expect even number of lines (header + sequence pairs)
assert len(lines) % 2 == 0

# Parse primer pairs
primers = []
for i in range(0, len(lines), 2):
    header = lines[i]
    seq = lines[i+1]
    assert header.startswith(">")
    primers.append((header[1:], seq))

print(f"Total primers: {len(primers)}")
print(f"Primer pairs: {len(primers) // 2}")
EOF
```

## Verifier checklist (must all pass)

- [ ] `/app/primers.fasta` exists and has no blank lines.
- [ ] Primers are grouped by pairs (forward first, then reverse).
- [ ] Annealing regions are 15-45 nucleotides long.
- [ ] Each primer's Tm (oligotm with required flags, annealing region only) is 58-72 degrees Celsius.
- [ ] Each pair has Tm difference ≤ 5 degrees Celsius.
- [ ] Minimum number of primer pairs used.
- [ ] Primers, when used in Q5 mutagenesis, produce the output plasmid from the input.

## Common pitfalls

1. **Confusing Q5 mutagenesis primer design with traditional PCR primers.**
   Q5 mutagenesis uses back-to-back (diverging) primers that amplify the
   entire plasmid. They do NOT face each other like traditional PCR primers.
   The 5' ends are adjacent on the circular template.
2. **Including the mutation extension in Tm calculation.** Only the
   template-annealing region counts for Tm. The 5' mutation/extension does
   not anneal to the template and should be excluded from the Tm computation.
3. **Designing overlapping primers instead of back-to-back.** Traditional
   QuikChange uses overlapping primers with the mutation in the middle. Q5
   uses back-to-back primers. Using the wrong design strategy will fail
   mutagenesis.
4. **Not minimizing primer pairs.** If multiple mutations are close together,
   they can be combined into a single primer pair. The spec requires the
   minimum number.
5. **Forgetting the 5' phosphorylation requirement.** Q5 mutagenesis PCR
   products need 5' phosphorylation for circularization. The kit typically
   includes a phosphorylation step, but if your design relies on this, be
   aware of it. (The task likely handles this via the kit.)

## Quick sanity test

```python
import subprocess

def tm(seq):
    r = subprocess.run(["oligotm", "-tp", "1", "-sc", "1", "-mv", "50",
                        "-dv", "2", "-n", "0.8", "-d", "500"],
                       input=seq, capture_output=True, text=True)
    return float(r.stdout.strip())

with open("/app/primers.fasta") as f:
    lines = f.read().strip().split("\n")

pairs = []
for i in range(0, len(lines), 2):
    if i + 2 < len(lines):
        fwd_seq = lines[i+1]
        rev_seq = lines[i+3]
        # Note: Tm should be computed on annealing region only,
        # not the full primer. Extract the annealing portion.
        pairs.append((fwd_seq, rev_seq))

for i, (fwd, rev) in enumerate(pairs):
    fwd_tm = tm(fwd)  # Replace with annealing-region-only
    rev_tm = tm(rev)  # Replace with annealing-region-only
    diff = abs(fwd_tm - rev_tm)
    print(f"Pair {i+1}: fwd Tm={fwd_tm:.1f}, rev Tm={rev_tm:.1f}, diff={diff:.1f}")
    # assert 58 <= fwd_tm <= 72
    # assert 58 <= rev_tm <= 72
    # assert diff <= 5
```

## Reference pointers

- NEB Q5 Site-Directed Mutagenesis Kit: https://www.neb.com/products/e0554-q5-site-directed-mutagenesis-kit
- Q5 mutagenesis primer design guidelines: https://www.neb.com/en/applications/cloning-and-synthetic-biology/site-directed-mutagenesis
- primer3 oligotm: https://primer3.org/manual.html
- Key difference: Q5 uses back-to-back primers; traditional QuikChange uses overlapping primers. Double-check which design strategy to use by reading the NEB protocol.
