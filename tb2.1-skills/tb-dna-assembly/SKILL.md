---
name: tb-dna-assembly
description: Design PCR primers for Golden Gate assembly of a multi-fragment plasmid using the NEBridge Golden Gate kit with BsaI-HF v2 enzyme. Use this skill whenever the task mentions designing PCR primers, Golden Gate assembly, BsaI-HF v2 restriction enzyme, NEBridge, plasmid construction from multiple linear fragments, or producing a `primers.fasta` file with specific format requirements. Also trigger when the user references `sequences.fasta`, circular plasmids, EGFP/FLAG/SNAP protein sequences, or needs to respect primer design constraints (annealing length 15-45 nt, Tm 58-72 degrees Celsius, pair Tm difference ≤ 5 degrees Celsius, using primer3's oligotm). The skill covers: analyzing plasmid sequences, designing BsaI cut-site overhangs, computing melting temperatures, using primer3 tools, and formatting FASTA output.
---

# tb-dna-assembly

Design PCR primers that amplify four DNA fragments (input plasmid backbone,
EGFP, FLAG, SNAP) with BsaI-HF v2 cut-sites, enabling one-pot Golden Gate
assembly into a target output plasmid. Output the minimal set of primer pairs
as a FASTA file. This is a Terminal-Bench 2.1 task; the full task spec lives
at `tasks/dna-assembly/`.

## When this skill triggers

Use it when the user is dropped into the `dna-assembly` Docker container and
needs to design primer pairs for Golden Gate assembly with BsaI-HF v2. Do
**not** use it for Gibson assembly, TOPO cloning, site-directed mutagenesis,
or general PCR primer design — this is specifically about designing primers
with BsaI recognition sites and compatible overhangs for multi-fragment
Golden Gate assembly.

## Goal (one sentence)

Design the minimum number of PCR primer pairs that add BsaI-HF v2 cut-sites
to four fragments for one-pot Golden Gate assembly into the target output
plasmid, respecting primer length, Tm, and pair-matching constraints.

## Required outputs

| File | Purpose |
|---|---|
| `/app/primers.fasta` | FASTA file with primer sequences. Headers format: `>TEMPLATENAME_DIR` where DIR is `fwd` or `rev`. No blank lines. Minimum number of primer pairs. |

Input: `/app/sequences.fasta` contains the five sequences (input, egfp, flag,
snap, output) — do NOT modify.

## Recommended workflow

### 1. Analyze the input sequences (≈ 5 min)

```bash
cat /app/sequences.fasta
```

Identify:
- **input**: The circular input plasmid backbone. This will be linearized and
  may serve as the destination vector.
- **egfp, flag, snap**: Three linear DNA sequences to be inserted.
- **output**: The desired circular output plasmid — this is your target to
  match.

Compare the input + fragments to the output to understand the assembly order.
Read the sequences and determine which fragment goes where in the final
plasmid.

### 2. Understand BsaI-HF v2 and Golden Gate (≈ 10 min)

The NEBridge Golden Gate kit uses BsaI-HF v2 (also known as BsaI or Eco31I):

- Recognition site: `GGTCTC` (5' -> 3')
- Cleavage: `GGTCTC(N)1/(N)5` — cuts 1 base after the recognition site on
  the top strand, 5 bases after on the bottom strand, creating a 4-base
  5' overhang.
- The overhang sequence (4 bases) can be custom-designed per junction.
- Golden Gate uses Type IIS enzymes: cut site is outside the recognition
  sequence, so the overhangs can be designed independently of the enzyme
  recognition site.

Key design rules:
- Each inter-fragment junction needs a unique 4-base overhang (no two
  junctions share the same overhang).
- The recognition site must be oriented so that it is removed after ligation
  (placed at the primer 5' end, outside the fragment).
- The final assembled product should not contain any BsaI sites.

### 3. Plan the assembly junctions (≈ 10 min)

Align the fragments with the output plasmid to determine:
1. The circular order of fragments in the output.
2. The exact nucleotide positions where each fragment starts and ends.
3. The 4-base overhang needed at each junction.

For `N` fragments in a circular assembly, you need `N` junctions and `N` unique
4-base overhangs. Choose overhangs that:
- Are not self-complementary (avoid palindromes).
- Differ from each other by at least 2 bases.
- Do not appear in the fragment sequences themselves (to avoid internal
  cut-sites).

### 4. Design primers (≈ 15 min)

For each fragment, design forward and reverse primers:

```
Forward primer: 5' - [BsaI site] [4-base overhang] [template-annealing region] - 3'
Reverse primer: 5' - [BsaI site] [4-base overhang] [template-annealing region] - 3'
```

The BsaI site is `GGTCTC` plus a spacer (typically 1-3 bases for efficient
cleavage, e.g., `NNNGGTCTC`).

**Template-annealing region constraints:**
- Length: 15-45 nucleotides.
- Tm: 58-72 degrees Celsius (computed with `oligotm` tool).
- Pair Tm difference: at most 5 degrees Celsius between forward and reverse.

### 5. Compute melting temperatures (≈ 10 min)

Use primer3's `oligotm` tool with the exact flags specified:
```bash
oligotm -tp 1 -sc 1 -mv 50 -dv 2 -n 0.8 -d 500 <primer_sequence>
```

Or from Python:
```python
import subprocess

def compute_tm(sequence: str) -> float:
    """Compute Tm for a primer sequence using oligotm."""
    result = subprocess.run(
        ["oligotm", "-tp", "1", "-sc", "1", "-mv", "50", "-dv", "2",
         "-n", "0.8", "-d", "500"],
        input=sequence,
        capture_output=True,
        text=True,
    )
    # Parse the output — typically a single float line
    return float(result.stdout.strip())
```

Only the template-annealing part (not the BsaI site or overhang) contributes
to Tm. Compute Tm on just the annealing region.

### 6. Iterate until all constraints are met (≈ 10 min)

For each primer pair:
1. Design the annealing region (15-45 bp).
2. Compute Tm for forward and reverse annealing regions.
3. Check: both Tm in [58, 72], |Tm_fwd - Tm_rev| ≤ 5.
4. If constraints fail, adjust the annealing region length (longer raises Tm,
   shorter lowers Tm).

Use the minimum number of primer pairs. Since there are 4 template fragments
(input, egfp, flag, snap) and each needs amplification with BsaI ends, you
likely need 4 primer pairs (8 primers total), but some fragments may share
primers if they share sequence ends — check the output plasmid structure.

### 7. Write the FASTA file (≈ 5 min)

```python
primers = [
    ("input_fwd", "NNNGGTCTCN<overhang><annealing_seq>"),
    ("input_rev", "NNNGGTCTCN<overhang><annealing_seq>"),
    ("egfp_fwd", "NNNGGTCTCN<overhang><annealing_seq>"),
    ("egfp_rev", "NNNGGTCTCN<overhang><annealing_seq>"),
    # ... etc
]

with open("/app/primers.fasta", "w") as f:
    for header, seq in primers:
        f.write(f">{header}\n{seq}\n")
# Ensure no trailing blank line
```

Headers must follow the format `>TEMPLATENAME_DIR`:
- TEMPLATENAME: one of `input`, `egfp`, `flag`, `snap`.
- DIR: `fwd` or `rev`.

### 8. Verify (≈ 3 min)

```bash
# Check format
grep "^>" /app/primers.fasta  # All headers
grep -v "^>" /app/primers.fasta | wc -l  # Count sequences
python3 -c "
with open('/app/primers.fasta') as f:
    content = f.read()
assert '\n\n' not in content, 'No blank lines allowed'
lines = content.strip().split('\n')
# Check headers
for i in range(0, len(lines), 2):
    assert lines[i].startswith('>')
    tmpl, direction = lines[i][1:].rsplit('_', 1)
    assert tmpl in ['input', 'egfp', 'flag', 'snap']
    assert direction in ['fwd', 'rev']
print('Format OK')
"
```

## Verifier checklist (must all pass)

- [ ] `/app/primers.fasta` exists and has no blank lines.
- [ ] Headers follow the `>TEMPLATENAME_DIR` format.
- [ ] Template names are from {input, egfp, flag, snap}.
- [ ] Annealing regions are 15-45 nucleotides long.
- [ ] Each primer's Tm (by oligotm with the required flags) is 58-72 degrees Celsius.
- [ ] Each forward/reverse pair has Tm within 5 degrees Celsius of each other.
- [ ] BsaI-HF v2 cut-sites are correctly designed (GGTCTC + correct overhangs).
- [ ] Minimum number of primer pairs used.
- [ ] Primers, when used in Golden Gate assembly, produce the output plasmid.

## Common pitfalls

1. **Wrong BsaI recognition site orientation.** The BsaI site `GGTCTC` must
   be oriented so the cut occurs in the fragment, not in the primer backbone,
   and the recognition site itself is removed after ligation. Placing the site
   on the wrong side of the overhang is a classic mistake.
2. **Computing Tm on the full primer (including restriction site).** The spec
   says Tm is "computed with respect to only the part of the primers that
   anneal to its respective template." Exclude the BsaI site and overhang from
   the Tm calculation.
3. **Duplicate overhangs.** Each junction in a Golden Gate assembly needs a
   unique 4-base overhang. If two junctions share the same overhang,
   fragments will assemble in the wrong order.
4. **Palindrome overhangs.** Self-complementary overhangs (e.g., `ATAT`,
   `GCGC`) can cause fragment self-ligation and reduce assembly efficiency.
5. **Not using the minimum number of primer pairs.** The spec explicitly
   requires the minimum number. Check if any fragments can share template
   regions (e.g., if the input plasmid is linearized with BsaI directly,
   it may not need PCR).
6. **Internal BsaI sites in fragments.** If any fragment contains `GGTCTC`
   internally, BsaI will cut it. Either choose different overhang positions
   or modify the sequence (if allowed).

## Quick sanity test

```bash
# Check all primer Tms
python3 << 'EOF'
import subprocess

def tm(seq):
    r = subprocess.run(["oligotm", "-tp", "1", "-sc", "1", "-mv", "50",
                        "-dv", "2", "-n", "0.8", "-d", "500"],
                       input=seq, capture_output=True, text=True)
    return float(r.stdout.strip())

with open("/app/primers.fasta") as f:
    lines = f.read().strip().split("\n")

pairs = {}
for i in range(0, len(lines), 2):
    header = lines[i][1:]
    seq = lines[i+1]
    tmpl, d = header.rsplit("_", 1)
    pairs.setdefault(tmpl, {})[d] = seq

for tmpl, primers in pairs.items():
    tm_fwd = tm(primers["fwd"])
    tm_rev = tm(primers["rev"])
    print(f"{tmpl}: fwd Tm={tm_fwd:.1f}, rev Tm={tm_rev:.1f}, diff={abs(tm_fwd-tm_rev):.1f}")
    assert 58 <= tm_fwd <= 72
    assert 58 <= tm_rev <= 72
    assert abs(tm_fwd - tm_rev) <= 5
EOF
```

## Reference pointers

- NEBridge Golden Gate Assembly: https://www.neb.com/en/applications/cloning-and-synthetic-biology/dna-assembly/golden-gate-assembly
- BsaI-HF v2 (NEB #R3733): https://www.neb.com/products/r3733-bsai-hf-v2
- primer3 oligotm documentation: https://primer3.org/manual.html
- NEB Type IIS restriction enzymes: https://www.neb.com/tools-and-resources/usage-guidelines/type-iis-restriction-enzymes
