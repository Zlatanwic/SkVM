---
name: tb-sqlite-db-truncate
description: Recover data from a corrupted SQLite database that was damaged through binary truncation. Use this skill when the task mentions recovering SQLite data, binary truncation, corrupted database files, `/app/trunc.db`, producing `/app/recover.json`, or extracting word/value pairs from a damaged SQLite file. Also trigger when the user references binary file analysis, SQLite file format parsing, or the need to salvage partial data from a truncated file.
---

# tb-sqlite-db-truncate

Recover as many rows as possible from a SQLite database (`/app/trunc.db`) that
was corrupted through binary truncation, outputting the salvaged data as a JSON
array of `{"word": ..., "value": ...}` objects. This is a Terminal-Bench 2.1
task; the full task lives at `tasks/sqlite-db-truncate/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `sqlite-db-truncate` Docker container
and needs to extract data from a truncated SQLite file. Do **not** use it for
normal SQLite queries, database repair via `.dump`/`.recover`, or corruption
caused by logical errors (DROP TABLE, DELETE without WHERE, etc.). This is
specifically about binary-level file truncation where parts of the file are
physically missing.

## Goal (one sentence)

Extract all recoverable `word`/`value` pairs from the truncated SQLite database
and save them as a JSON array in `/app/recover.json`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/recover.json` | JSON array of objects: `[{"word": "testwordXY", "value": M}, {"word": "testwordZZ", "value": N}, ...]` containing all recovered rows. |

## Recommended workflow

### 1. Diagnose the damage (≈ 5 min)

- Run `file /app/trunc.db` to confirm it is (or was) a SQLite database.
- Try `sqlite3 /app/trunc.db "SELECT * FROM ..."` -- this will likely fail
  because the file is truncated.
- Check the file size: `ls -la /app/trunc.db`.
- Try to dump with `sqlite3 /app/trunc.db ".dump"` -- the schema may be
  recoverable even if data pages are damaged.
- If `sqlite3` refuses to open it, use a hex dump: `hexdump -C /app/trunc.db | head -100`.

### 2. Understand SQLite file format (≈ 5 min)

- SQLite files consist of pages (typically 4096 bytes). The first page (page 1)
  contains the header (first 100 bytes) including the magic string
  `"SQLite format 3\0"`.
- Truncation means the file ends abruptly -- some trailing pages are missing.
- Pages before the truncation point are likely intact. Pages at the truncation
  boundary may be partially present.
- Key recovery strategy: read intact pages directly from the binary file,
  bypassing the SQLite library's integrity checks.

### 3. Attempt high-level recovery first (≈ 5 min)

```bash
# Try SQLite's built-in recovery
sqlite3 /app/trunc.db ".recover" > /tmp/recovered.sql 2>&1
sqlite3 /app/trunc.db ".dump" > /tmp/dump.sql 2>&1

# If that fails, try the .recover dot-command
echo ".recover" | sqlite3 /app/trunc.db

# Try opening with various pragmas to bypass checks
sqlite3 /app/trunc.db "PRAGMA integrity_check;"
```

### 4. Parse the binary file directly (≈ 15 min)

When high-level recovery fails, parse the SQLite file at the binary level:

1. **Find the schema** (page 1): Parse the `sqlite_master` table to learn the
   table structure (column names, types).
2. **Identify leaf pages**: SQLite B-tree leaf pages contain the actual row data.
   Pages that are fully intact can be decoded.
3. **Decode cell payloads**: Each cell in a leaf page contains a row. The payload
   format is a header with type codes followed by the values. For simple types
   (integers, text), these can be read directly.
4. **Extract from partial pages**: The last page before truncation may be
   partially present. Cells that are fully contained before the truncation point
   can still be recovered.

A Python approach using struct:
```python
import struct

with open('/app/trunc.db', 'rb') as f:
    data = f.read()

# Check SQLite magic
assert data[:16] == b'SQLite format 3\x00'

# Page size is at offset 16 (2 bytes, big-endian)
page_size = struct.unpack('>H', data[16:18])[0]

# Parse pages, extract cells, decode values
```

### 5. Assemble the JSON output (≈ 5 min)

- Collect all recovered `(word, value)` pairs into a Python list of dicts.
- Write as JSON: `json.dump(results, open('/app/recover.json', 'w'))`.
- Validate the JSON is well-formed: `python3 -c "import json; json.load(open('/app/recover.json'))"`.

## Verifier checklist (must all pass)

- [ ] `/app/recover.json` exists and is valid JSON.
- [ ] File contains an array of objects, each with `"word"` and `"value"` keys.
- [ ] Recovered rows match the original (pre-truncation) data within tolerance.
- [ ] As many rows as possible are recovered (verifier compares count).

## Common pitfalls

1. **Giving up after `sqlite3` refuses to open the file.** The `sqlite3` CLI
   checks database integrity on open and will reject a truncated file. But the
   data pages before the truncation point may be fully intact. Parse them from
   the raw binary.
2. **Missing the schema.** Without understanding the table schema (column count,
   types), you cannot correctly decode cell payloads. The schema is stored in
   page 1 in the `sqlite_master` table. Parse it first.
3. **Incorrect varint decoding.** SQLite uses variable-length integers (varints)
   for many internal values (cell size, row IDs, payload lengths). Implement or
   borrow a correct SQLite varint decoder -- off-by-one errors are common.
4. **Assuming all rows are equally recoverable.** Cells that span two pages are
   lost if the boundary page is missing. Cells fully contained within intact
   pages are recoverable. Don't try to reconstruct partial cells -- skip them.
5. **Overlooking the record format.** SQLite's record format uses a header of
   serial type codes (varints) followed by the actual values. The serial type
   encodes both the type and the byte length. Misreading a single varint throws
   off all subsequent fields.

## Reference pointers

- SQLite file format documentation: `https://www.sqlite.org/fileformat.html`
  -- sections on the database header, B-tree pages, and record format.
- The `struct` module in Python for parsing binary integers (`>H` for big-endian
  uint16, `>I` for uint32).
- SQLite varint encoding: high bit of each byte indicates whether more bytes
  follow. 1-9 bytes total.
- The hex dump of `/app/trunc.db` is your primary debugging tool: use
  `hexdump -C` or `xxd` to inspect raw bytes at specific offsets.
