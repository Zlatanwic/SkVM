---
name: tb-db-wal-recovery
description: Recover data from an XOR-encrypted (corrupted) SQLite WAL file, decrypt it, and extract all database records (including those in the write-ahead log) into a sorted JSON file. Use this skill whenever the task mentions SQLite WAL recovery, XOR-encrypted database files, recovering write-ahead log records, fixing a corrupted WAL file, or extracting the full dataset (not just the base 5 rows) from a WAL-mode SQLite database. Also trigger when the user references `/app/recovered.json`, 11 total records vs 5 visible, or needs to reverse XOR obfuscation on database files. The skill covers: understanding SQLite WAL format, detecting XOR encryption, decrypting the WAL, using sqlite3 tools to dump data, and producing sorted JSON output.
---

# tb-db-wal-recovery

Decrypt an XOR-obfuscated SQLite WAL (Write-Ahead Log) file, recover all 11
database records (not just the 5 visible in the base database), and write them
as sorted JSON to `/app/recovered.json`. This is a Terminal-Bench 2.1 task;
the full task spec lives at `tasks/db-wal-recovery/`.

## When this skill triggers

Use it when the user is dropped into the `db-wal-recovery` Docker container
and needs to recover data from a seemingly corrupted or encrypted SQLite WAL
file. Do **not** use it for general SQLite repair, `.dump` of a healthy
database, or WAL checkpointing — this task is specifically about decrypting the
WAL via XOR and extracting records that exist only in the WAL, not in the base
database.

## Goal (one sentence)

Decrypt the XOR-encrypted WAL file, recover all 11 database records (base +
WAL), and write them sorted by `id` as a JSON array to `/app/recovered.json`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/recovered.json` | JSON array of all 11 records sorted by `id`, each with `id`, `name`, and `value` keys. |

## Recommended workflow

### 1. Explore the database directory (≈ 3 min)

```bash
ls -la /app/
# Look for: *.db, *.db-wal, *.db-shm
file /app/*.db /app/*.db-wal 2>/dev/null
```

Typical SQLite WAL-mode database has three files:
- `database.db` — the main database file.
- `database.db-wal` — the Write-Ahead Log.
- `database.db-shm` — shared memory index.

### 2. Inspect the current state (≈ 5 min)

```bash
sqlite3 /app/database.db "SELECT COUNT(*) FROM table_name;"
sqlite3 /app/database.db "SELECT * FROM table_name;"
# Expected: only 5 records visible
```

The WAL file contains additional changes (6 more records or modifications to
existing records) that are not checkpointed into the main database.

### 3. Detect XOR encryption (≈ 5 min)

The instruction says the WAL is "corrupted or encrypted." A common obfuscation
technique is XOR with a fixed key:

```bash
# Look for patterns - XOR-encrypted SQLite WAL still has structure
xxd /app/database.db-wal | head -20
xxd /app/database.db-wal | tail -20

# A valid SQLite WAL starts with magic bytes: 0x377f0682 or 0x377f0683
# If these are missing, try XOR with common single-byte keys
python3 -c "
with open('/app/database.db-wal', 'rb') as f:
    header = f.read(8)
print(header.hex())
# Try XOR with 0xFF or other common keys
for key in [0xFF, 0xAA, 0x55, 0x37, 0x13, 0x42]:
    xored = bytes(b ^ key for b in header)
    print(f'Key 0x{key:02x}: {xored.hex()}')
"
```

The XOR key may be embedded in the database file itself or derivable from
known WAL structure. The SQLite WAL header at offset 0 has a 4-byte magic
number: `0x377f0682` or `0x377f0683`. XOR the observed header with this
expected magic to determine the key.

### 4. Decrypt the WAL (≈ 5 min)

```python
def xor_decrypt(data: bytes, key: int) -> bytes:
    return bytes(b ^ key for b in data)

# Read the WAL
with open("/app/database.db-wal", "rb") as f:
    encrypted = f.read()

# Determine the key
expected_magic = bytes([0x37, 0x7f, 0x06, 0x82])  # WAL magic
# Or try to find the key from the first byte
key = encrypted[0] ^ 0x37  # If single-byte XOR

decrypted = xor_decrypt(encrypted, key)

# Verify the decrypted magic
assert decrypted[:4] == expected_magic or decrypted[:4] == bytes([0x37, 0x7f, 0x06, 0x83]), \
    f"Wrong key, got magic: {decrypted[:4].hex()}"

# Write decrypted WAL
with open("/app/database.db-wal", "wb") as f:
    f.write(decrypted)
```

Note: If the key is not single-byte XOR, look for repeating patterns. The key
might be multi-byte (repeating-key XOR) or derived from the database file.

### 5. Recover the data (≈ 5 min)

Once the WAL is decrypted:

```bash
# Option A: Try to open the database normally
sqlite3 /app/database.db "SELECT * FROM table_name;"
# If the WAL is now readable, sqlite3 should show all records

# Option B: Use the .recover command
sqlite3 /app/database.db ".recover" | sqlite3 /app/recovered.db
sqlite3 /app/recovered.db "SELECT * FROM table_name;"

# Option C: Dump from the WAL directly
sqlite3 /app/database.db ".dump"
```

### 6. Write the JSON output (≈ 5 min)

```python
import sqlite3
import json

conn = sqlite3.connect("/app/database.db")
cursor = conn.execute("SELECT id, name, value FROM table_name ORDER BY id")
rows = [{"id": row[0], "name": row[1], "value": row[2]} for row in cursor.fetchall()]
conn.close()

with open("/app/recovered.json", "w") as f:
    json.dump(rows, f, indent=2)

print(f"Recovered {len(rows)} records")
assert len(rows) == 11, f"Expected 11 records, got {len(rows)}"
```

### 7. Verify (≈ 2 min)

```bash
python3 -c "
import json
with open('/app/recovered.json') as f:
    data = json.load(f)
print(f'Records: {len(data)}')
assert len(data) == 11, 'Must have 11 records'
ids = [r['id'] for r in data]
assert ids == sorted(ids), 'Must be sorted by id'
for r in data:
    assert 'id' in r and 'name' in r and 'value' in r
print('OK')
"
```

## Verifier checklist (must all pass)

- [ ] `/app/recovered.json` exists and is valid JSON.
- [ ] Contains exactly 11 records, sorted by `id`.
- [ ] Each record has `id` (integer), `name` (string), and `value` keys.
- [ ] The specific values in each record match the verifier's expected data.
- [ ] The WAL file is properly decrypted (not just the base 5 records).

## Common pitfalls

1. **Only getting 5 records.** The base database has 5 records; the remaining
   6 are in the WAL. If you only see 5, the WAL is still encrypted or
   sqlite3 is ignoring it.
2. **Wrong XOR key.** Single-byte XOR is the most common but verify by
   checking the decrypted WAL header magic bytes (`0x377f0682`). A wrong key
   will corrupt the WAL further and sqlite3 will reject it.
3. **Forgetting to handle the SHM file.** The `-shm` file (shared memory) may
   also need attention. Sometimes removing it (`rm /app/database.db-shm`)
   allows sqlite3 to reconstruct from a valid WAL.
4. **Sort order.** The verifier expects records sorted by `id` in ascending
   order. Use `ORDER BY id` in your query.
5. **Multi-byte XOR key.** If single-byte XOR doesn't work, check for
   repeating-key XOR by examining patterns in the encrypted data. The key
   length can be found by looking at repeating XOR (Kasiski examination).

## Quick sanity test

```bash
# Decrypt and verify
python3 -c "
import sqlite3, json

# Check if all records are now accessible
conn = sqlite3.connect('/app/database.db')
count = conn.execute('SELECT COUNT(*) FROM table_name').fetchone()[0]
print(f'Total records: {count}')
assert count == 11, f'Expected 11, got {count}'

rows = conn.execute('SELECT id, name, value FROM table_name ORDER BY id').fetchall()
for r in rows:
    print(r)
conn.close()
"
```

## Reference pointers

- SQLite WAL format: https://www.sqlite.org/walformat.html
- SQLite WAL magic number: `0x377f0682` (little-endian 4 bytes at offset 0).
- SQLite `.recover` command: https://www.sqlite.org/cli.html#recover_data_from_a_corrupt_database
- XOR decryption patterns: the key is typically a single byte or short repeating sequence.
- Inside the task container, the verifier checks the exact data values in `/app/recovered.json`.
