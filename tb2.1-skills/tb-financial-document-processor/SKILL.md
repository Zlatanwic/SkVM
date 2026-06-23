---
name: tb-financial-document-processor
description: Classify mixed JPG/PDF documents as invoices vs. other, extract invoice totals and VAT from OCR'd text, and produce a summary CSV. Use this skill whenever the task involves processing financial documents, OCR on scanned invoices/receipts, classifying documents by content type, extracting total_amount and vat_amount from invoice images, generating `/app/invoices/summary.csv` with a totals row, moving files into `/app/invoices/` and `/app/other/` directories, or working inside the `financial-document-processor` Docker container. Also trigger when the user needs to parse "Total", "Amount Due", "Grand Total", "VAT", "Tax", or "GST" fields from OCR output.
---

# tb-financial-document-processor

Process a mixed collection of JPG and PDF documents in `/app/documents/`,
classify each as "invoice" or "other", extract financial fields from invoices,
and produce a summary CSV. This is one of the Terminal-Bench 2.1 task skills;
the full task lives at `tasks/financial-document-processor/` in the same repo
as this skill.

## When this skill triggers

Use it when the user is dropped into the `financial-document-processor` Docker
container and needs to: classify documents, extract invoice data via OCR,
produce `/app/invoices/summary.csv`, and empty the source directory. Do
**not** use it for general document parsing or PDF text extraction — this is
specifically about invoice detection, financial amount extraction, and CSV
aggregation with a final totals row.

## Goal (one sentence)

Classify all documents in `/app/documents/` as invoice or non-invoice, extract
`total_amount` and `vat_amount` from each invoice, move files to appropriate
directories, and produce `/app/invoices/summary.csv` with per-invoice rows and
a final `total` row.

## Required outputs

| File | Purpose |
|---|---|
| `/app/invoices/` | Directory containing all documents classified as invoices. |
| `/app/other/` | Directory containing all documents classified as non-invoice. |
| `/app/invoices/summary.csv` | CSV with columns `filename,total_amount,vat_amount`, one row per invoice plus a final `total` row summing both numeric columns. |
| `/app/documents/` (empty) | Source directory must be empty after processing (all files moved). |

The verifier checks that: (1) documents are correctly classified, (2) financial
amounts are extracted accurately, (3) the summary CSV has correct structure and
totals, (4) the source directory is empty.

## Recommended workflow

### 1. Survey the documents (≈ 3 min)

```bash
ls -la /app/documents/
file /app/documents/*
# Expect a mix of: JPEG images of scanned invoices, PDF files
# (which may contain embedded text or be image-based scans)
```

Check available tooling:

```bash
which tesseract || apt-get install -y tesseract-ocr
which pdftotext || apt-get install -y poppler-utils
python3 -c "import PIL; print('Pillow OK')" || pip install Pillow
python3 -c "import pytesseract; print('pytesseract OK')" || pip install pytesseract
python3 -c "import pdf2image; print('pdf2image OK')" || pip install pdf2image
```

### 2. Design the classification logic (≈ 5 min)

An invoice typically contains distinctive keywords:
- "Invoice", "INVOICE", "Invoice #", "Invoice Number"
- "Bill To", "Ship To", "Billing Address"
- "Due Date", "Payment Terms"
- "Subtotal", "Total", "Amount Due", "Grand Total"
- "VAT", "Tax", "GST", "HST"
- Line items with quantities, unit prices, and amounts
- Company letterhead, tax ID numbers

Classification approach:
- OCR each document to extract text.
- Run keyword matching: count invoice-indicative terms vs. generic terms.
- If a document has a high invoice-keyword density (e.g., "Total" + "Invoice"
  present), classify as invoice; otherwise, "other".

### 3. Build the processing script (≈ 20 min)

```python
#!/usr/bin/env python3
""" /app/process_documents.py — classify documents and extract invoice data. """

import os
import csv
import re
import shutil
from pathlib import Path
from PIL import Image
import pytesseract
from pdf2image import convert_from_path

SRC = Path("/app/documents")
INVOICES = Path("/app/invoices")
OTHER = Path("/app/other")
INVOICES.mkdir(exist_ok=True)
OTHER.mkdir(exist_ok=True)

def ocr_file(filepath: Path) -> str:
    """Extract text from JPG or PDF. For PDFs, convert to images first."""
    ext = filepath.suffix.lower()
    if ext in ('.jpg', '.jpeg', '.png'):
        return pytesseract.image_to_string(Image.open(filepath))
    elif ext == '.pdf':
        images = convert_from_path(filepath)
        return '\n'.join(pytesseract.image_to_string(img) for img in images)
    else:
        return ''

def is_invoice(text: str) -> bool:
    """Heuristic: check for invoice-indicative keywords."""
    text_lower = text.lower()
    invoice_signals = ['invoice', 'total', 'amount due', 'grand total',
                       'bill to', 'due date', 'subtotal', 'vat', 'tax invoice']
    score = sum(1 for kw in invoice_signals if kw in text_lower)
    return score >= 3

def extract_amounts(text: str) -> tuple:
    """Extract total_amount and vat_amount from OCR text.

    Priority: "Total" over "Amount Due" when both differ.
    """
    total = 0.0
    vat = 0.0

    # Look for "Total" with a currency amount pattern
    # Pattern: optionally preceded by $/€/£, number with optional comma,
    # optional decimal
    amount_pattern = r'(?:[\$\€\£]\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2}))'

    # Try "Total" first (not "Subtotal" or "Grand Total")
    total_match = re.search(
        r'(?<!Sub)(?<!Grand )Total[:\s]*' + amount_pattern,
        text, re.IGNORECASE
    )
    if not total_match:
        # Fall back to "Amount Due" or "Grand Total"
        total_match = re.search(
            r'(?:Amount Due|Grand Total)[:\s]*' + amount_pattern,
            text, re.IGNORECASE
        )
    if total_match:
        total = float(total_match.group(1).replace(',', ''))

    # Extract VAT
    vat_match = re.search(
        r'(?:VAT|Tax|GST)[:\s]*' + amount_pattern,
        text, re.IGNORECASE
    )
    if vat_match:
        vat = float(vat_match.group(1).replace(',', ''))

    return total, vat

results = []
for filepath in sorted(SRC.iterdir()):
    if filepath.is_dir():
        continue
    text = ocr_file(filepath)
    if is_invoice(text):
        total, vat = extract_amounts(text)
        results.append((filepath.name, total, vat))
        shutil.move(str(filepath), str(INVOICES / filepath.name))
    else:
        shutil.move(str(filepath), str(OTHER / filepath.name))

# Write summary CSV
with open(INVOICES / 'summary.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['filename', 'total_amount', 'vat_amount'])
    sum_total = 0.0
    sum_vat = 0.0
    for filename, total, vat in results:
        writer.writerow([filename, total, vat])
        sum_total += total
        sum_vat += vat
    writer.writerow(['total', sum_total, sum_vat])

print(f"Processed {len(results)} invoices, {len(results)} files moved to invoices/")
```

### 4. Handle the subtleties (≈ 10 min)

- **"Total" vs. "Amount Due" priority**: When both exist with different values,
  the instruction says to use "Total". Your regex should prioritize "Total"
  matches over "Amount Due" matches.
- **Zero VAT**: If VAT/Tax/GST is not found, set to 0 (not empty string).
  The verifier likely expects numeric 0.
- **Currency symbols**: Amounts may include `$`, `€`, `£`, or no symbol.
  Make your regex currency-agnostic.
- **Comma as thousand separator vs. decimal**: `1,234.56` (US) vs `1.234,56`
  (European). The Docker image likely uses one convention. Detect from context
  or handle both.
- **PDF with selectable text**: If a PDF already contains text (not just
  images), use `pdftotext` first, fall back to OCR only if the output is
  empty or gibberish.

### 5. Verify (≈ 3 min)

```bash
# Check directory structure
ls /app/invoices/
ls /app/other/
ls /app/documents/   # Should be empty

# Check CSV
cat /app/invoices/summary.csv

# Verify the totals row
python3 -c "
import csv
with open('/app/invoices/summary.csv') as f:
    reader = list(csv.reader(f))
    for row in reader:
        print(row)
"
```

## Verifier checklist (must all pass)

- [ ] `/app/documents/` is empty (all files moved).
- [ ] `/app/invoices/` contains only invoice-classified files.
- [ ] `/app/other/` contains only non-invoice files.
- [ ] `/app/invoices/summary.csv` exists with columns `filename,total_amount,vat_amount`.
- [ ] Each invoice has a row with correct total_amount and vat_amount.
- [ ] The final row has `filename=total` and the summed total_amount and vat_amount.
- [ ] Classification accuracy meets the verifier's threshold (likely 100%
      since the ground truth is known).

## Common pitfalls

1. **Using "Amount Due" when "Total" is also present with a different value.**
   The instruction explicitly says: "If both 'Total' and 'Amount Due' are
   present with different values, use only the 'Total' amount." Failing this
   priority rule produces wrong totals.
2. **Leaving VAT as empty string instead of 0.** The instruction says "if VAT
   is not present, set it to 0 or empty string" — but the CSV must have
   numeric columns. An empty string in a numeric column causes issues.
   Default to `0` or `0.0`.
3. **OCR misreading numbers.** Tesseract commonly confuses `5` with `S`, `0`
   with `O`, `1` with `l`, and `,` with `.`. Post-process the OCR output:
   validate that extracted "numbers" look like real numbers, and for
   financial amounts, verify they have exactly two decimal places.
4. **Not handling PDFs that are image-only.** Some PDFs have selectable text
   layers; others are scanned images wrapped in PDF containers. If you only
   use `pdftotext`, image-based PDFs return empty. Always have a fallback
   to OCR via `pdf2image` + Tesseract.
5. **Moving files before classification is written.** If you move files first
   and the script crashes, you lose the original layout. Process all files
   in a single pass: OCR -> classify -> extract -> move -> write CSV.

## Quick sanity test (run after writing)

```bash
# Run the processing script
python3 /app/process_documents.py

# Verify output structure
[ -z "$(ls -A /app/documents/)" ] && echo "PASS: documents/ empty" || echo "FAIL: documents/ not empty"
[ -s /app/invoices/summary.csv ] && echo "PASS: summary.csv exists" || echo "FAIL: no summary.csv"
head -5 /app/invoices/summary.csv
tail -1 /app/invoices/summary.csv  # Should be total row
```

## Reference pointers

- Tesseract OCR: `man tesseract` for page segmentation modes; `--psm 6` for
  uniform blocks, `--psm 3` for fully automatic.
- `pdf2image` wraps `poppler-utils` (`pdftoppm`); if it fails, check that
  `poppler-utils` is installed.
- Invoice field naming conventions vary by region: "VAT" (EU), "GST" (AU/IN),
  "HST" (Canada), "Tax" (US). Search for all of them.
- The verifier evaluates extraction accuracy — the extracted amounts must
  match the actual values on the invoice within a small tolerance.
