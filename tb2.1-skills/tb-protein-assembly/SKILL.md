---
name: tb-protein-assembly
description: Design a fusion protein gBlock for DHFR FRET experiments by querying bioinformatics APIs (PDB, FPbase), selecting donor/acceptor proteins with matching spectral properties, assembling subproteins with GS linkers, codon-optimizing for GC content constraints, and writing a plain DNA sequence to `/app/gblock.txt`. Use this skill whenever the task mentions designing a gBlock, fusion protein assembly, DHFR FRET, querying the PDB API for protein sequences, using FPbase for excitation/emission wavelengths, selecting proteins from `/app/pdb_ids.txt`, constructing an antibody binder-donor-DHFR-acceptor-molecule binder fusion, or enforcing GC content between 30-70% in 50-nucleotide windows. Also trigger when the user references the `protein-assembly` Docker container, asks about FRET filter cubes (505nm excitation / 610nm emission), GS linkers, or removing N-terminal methionines.
---

# tb-protein-assembly

Design a fusion protein gBlock for a DHFR FRET stability experiment by
selecting proteins from bioinformatics databases, arranging them with GS
linkers, applying codon optimization with GC content constraints, and
outputting a plain DNA sequence. This is a Terminal-Bench 2.1
scientific-computing task; the full task spec lives at
`tasks/protein-assembly/` in the repo.

## When this skill triggers

Use it when the user is dropped into the `protein-assembly` Docker container
and needs to produce `/app/gblock.txt` — a plain DNA sequence encoding a
5-domain fusion protein (antibody binder, donor, DHFR, acceptor, molecule
binder) with GS linkers, matching spectral properties for a 505/610 filter
cube, and meeting GC content constraints. Do **not** use it for general
molecular biology, plasmid design with start/stop codons, or protein
engineering outside the FRET context — this task is specifically about
integrating PDB API, FPbase API, and codon optimization into a single gBlock.

## Goal (one sentence)

Output `/app/gblock.txt` containing a codon-optimized DNA sequence encoding a
fusion protein (antibody binder - donor - DHFR - acceptor - molecule binder)
with GS linkers between each domain, where donor/acceptor peak spectra match
505nm/610nm, all proteins (except antibody binder) match PDB sequences from
`/app/pdb_ids.txt`, and GC content stays 30-70% in every 50-nucleotide window.

## Required outputs

| File | Purpose |
|---|---|
| `/app/gblock.txt` | Plain DNA sequence only — no headers, no empty lines. <= 3000 nucleotides. |

The verifier checks the DNA sequence for protein content, linker placement,
spectral matches, GC content compliance, length constraints, and correct
N-to-C terminus domain order.

## Recommended workflow

### 1. Survey inputs and constraints (≈ 5 min)

- Read `/app/pdb_ids.txt` to see which PDB IDs are available for donor,
  acceptor, and molecule binder proteins.
- Read `/app/antibody.fasta` to get the antibody heavy and light chain
  sequences — this determines the antibody binder protein target.
- Read `/app/plasmid.gb` to extract the DHFR protein sequence.
- Note the filter cube specs: excitation 505nm, emission 610nm.
- Re-read all structural constraints: domain order, linker rules, GC content,
  no start/stop codons, no N-terminal methionines, max 3000 nt.

### 2. Query the PDB API for protein sequences (≈ 5 min)

For each PDB ID in `/app/pdb_ids.txt`, fetch the corresponding FASTA sequence:

```bash
# PDB API returns FASTA for a given PDB ID
curl -s "https://www.rcsb.org/fasta/entry/1ABC" > /tmp/1ABC.fasta
```

Or use the EBI PDB API:
```bash
curl -s "https://www.ebi.ac.uk/pdbe/entry/pdb/1ABC/fasta"
```

Extract the amino acid sequence from each FASTA file. These sequences will
be used for the donor, acceptor, and molecule binder domains.

### 3. Query FPbase for spectral properties (≈ 5 min)

For each candidate fluorescent protein (donor and acceptor), query FPbase
to get excitation and emission peak wavelengths:

```bash
# FPbase API for protein spectral data
curl -s "https://www.fpbase.org/api/proteins/egfp/"
```

The donor must have peak emission near 505nm (matching the excitation filter).
The acceptor must have peak excitation near 505nm and peak emission near
610nm (matching the emission filter). This ensures efficient FRET through
the filter cube.

Select the best-matching donor and acceptor from the PDB IDs list based on
their spectral properties.

### 4. Determine the antibody binder protein (≈ 5 min)

- The antibody binder should be the protein the antibody was raised against
  (the antigen).
- Read `/app/antibody.fasta` to see the antibody sequences.
- Determine the target antigen. Use the most common variant of that protein
  sequence (a single copy, not repeated).
- Fetch the protein sequence from the PDB API or UniProt.

### 5. Assemble the fusion protein sequence (≈ 10 min)

Domain order (N to C terminus):
```
antibody_binder - GS_linker - donor - GS_linker - DHFR - GS_linker - acceptor - GS_linker - molecule_binder
```

Rules:
- Remove the N-terminal methionine from every protein (it comes from the
  plasmid's start codon).
- No GS linkers at the N or C terminus of the complete fusion.
- GS linkers between each pair of subproteins, each 5-20 amino acids long.
  GS linkers are glycine-serine repeats like `GSGSG`, `GSGSGSGSGS`, or
  `GGGGSGGGGS`.
- Vary linker lengths between 5 and 20 amino acids.
- The donor and acceptor must be separated only by DHFR and GS linkers
  (which is satisfied by the domain order above: donor -- DHFR -- acceptor).

### 6. Codon-optimize for GC content (≈ 15 min)

For each amino acid in the fusion protein:
- Map to a codon using a codon usage table.
- The GC content in every sliding 50-nucleotide window must be 30-70%.
  This means 15-35 G/C bases in any contiguous 50-base window.
- Choose between synonymous codons to tune GC content: codons ending in G or
  C raise GC content; codons ending in A or T lower it.
- Use a greedy or dynamic programming approach: for each codon position,
  select the synonymous codon that keeps all overlapping 50-nt windows within
  the 30-70% range.

### 7. Validate and write output (≈ 5 min)

```bash
# Check length
wc -c /app/gblock.txt    # should be <= 3000

# Check GC content in windows
python3 -c "
seq = open('/app/gblock.txt').read().strip()
for i in range(len(seq)-49):
    window = seq[i:i+50]
    gc = sum(1 for c in window if c in 'GC')
    pct = gc / 50 * 100
    if pct < 30 or pct > 70:
        print(f'Window {i}: GC={pct:.1f}%')
"

# Verify no empty lines, no headers
head -3 /app/gblock.txt
```

## Verifier checklist

- [ ] `/app/gblock.txt` exists and contains only the DNA sequence (no headers, no empty lines).
- [ ] Sequence length is valid and <= 3000 nucleotides.
- [ ] Donor and acceptor spectral peaks match 505nm / 610nm filter cube based on FPbase data.
- [ ] Donor, acceptor, and molecule binder sequences match PDB entries in `/app/pdb_ids.txt`.
- [ ] Antibody binder encodes the correct antigen (most common variant).
- [ ] DHFR sequence matches `plasmid.gb`.
- [ ] Domain order: antibody binder - donor - DHFR - acceptor - molecule binder.
- [ ] GS linkers between every adjacent subprotein pair, each 5-20 amino acids.
- [ ] No GS linkers at N or C terminus.
- [ ] No start/stop codons in the gBlock.
- [ ] N-terminal methionines removed from all subproteins.
- [ ] GC content 30-70% in every 50-nucleotide sliding window.

## Common pitfalls

1. **Wrong spectral matching.** The filter cube has excitation at 505nm and
   emission at 610nm. The donor needs peak *emission* near 505nm (to pass
   the excitation filter), and the acceptor needs peak *excitation* near
   505nm (to be excited by the donor) and peak *emission* near 610nm (to
   pass the emission filter). Misidentifying which peak matters for which
   filter is the most common error.
2. **GC content constraint violated in edge windows.** The 50-nucleotide
   sliding window check includes windows at the very beginning and end of
   the sequence. Even if most windows are fine, a single window outside
   30-70% fails the verifier. Check all windows, including partial windows
   if the verifier uses them.
3. **Including the antibody sequence as the binder.** The antibody binder
   is the *antigen* (the protein the antibody binds to), not the antibody
   itself. The antibody sequences in `antibody.fasta` tell you which
   protein to target — don't encode the antibody itself in the fusion.
4. **Forgetting to remove N-terminal methionines.** Every protein in the
   PDB or UniProt likely starts with Methionine (M, ATG). The gBlock
   reuses the plasmid's start codon, so the N-terminal Met must be removed
   from each subprotein. Keeping it adds an extra residue and may shift the
   reading frame.
5. **GS linker constraints missed.** Linkers must be exactly between
   subproteins (not at N/C termini), each must be 5-20 amino acids long,
   and they must be GS-type linkers (glycine + serine repeats). Using a
   single glycine or a non-GS linker fails the check.

## Reference pointers

- PDB REST API: `https://www.rcsb.org/fasta/entry/{pdb_id}` for protein sequences.
- FPbase API: `https://www.fpbase.org/api/proteins/` for fluorescent protein
  spectral data (excitation/emission peaks, extinction coefficients).
- UniProt API for antigen protein sequences and variants.
- Standard genetic code table for codon-to-amino-acid mapping.
- Inside the task container, the verifier at `tests/test_outputs.py` is the
  ground truth for all constraints.
- Task spec: `tasks/protein-assembly/instruction.md`.
