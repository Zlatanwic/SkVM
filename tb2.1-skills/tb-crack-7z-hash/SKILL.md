---
name: tb-crack-7z-hash
description: Crack a password-protected 7z archive using John the Ripper (with the 7z2john hash extractor), extract the secret file contents, and write the found word to `/app/solution.txt`. Use this skill whenever the task mentions cracking a 7z/7-Zip password, using John the Ripper for hash cracking, extracting the 7z hash with 7z2john, or recovering a secret from an encrypted archive. Also trigger when the user references `secrets.7z`, `secret_file.txt`, or `/app/solution.txt`. The skill covers: installing John the Ripper with 7z support, extracting the password hash from a 7z archive, running john with a wordlist or incremental mode, cracking the password, extracting the archive contents, and writing the secret to the output file.
---

# tb-crack-7z-hash

Crack a password-protected `secrets.7z` archive, extract `secret_file.txt`,
and write its single-word content to `/app/solution.txt`. This is a
Terminal-Bench 2.1 task; the full task spec lives at `tasks/crack-7z-hash/`.

## When this skill triggers

Use it when the user is dropped into the `crack-7z-hash` Docker container and
needs to recover the password of a 7z archive using John the Ripper. Do
**not** use it for generic password cracking (ZIP, RAR, PDF) or other hash
types — this task is specifically about 7z archive password recovery via
7z2john + john.

## Goal (one sentence)

Crack the password on `secrets.7z` using John the Ripper, extract
`secret_file.txt`, and write its content to `/app/solution.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/solution.txt` | Single plain-text file containing the word found in `secret_file.txt` inside `secrets.7z`. |

## Recommended workflow

### 1. Survey tools (≈ 2 min)

```bash
which 7z 7z2john john || true
dpkg -l | grep -E "7zip|john" || true
```

If tools are missing:
- `apt-get update && apt-get install -y p7zip-full john` (Ubuntu).
- `7z2john` may ship with John or as a separate script. If not found, install
  via `apt-get install -y john` (the community-enhanced version includes it).

### 2. Extract the hash from the 7z file (≈ 2 min)

```bash
cd /app
7z2john secrets.7z > hash.txt
```

`7z2john` outputs a hash line like:
```
secrets.7z:$7z$0$19$0$...$...$...$...
```

Inspect the hash to confirm it looks valid:
```bash
cat hash.txt
```

### 3. Crack the password with John the Ripper (≈ 5-10 min)

Start with a common wordlist:
```bash
john --wordlist=/usr/share/wordlists/rockyou.txt hash.txt
# or if rockyou is not available:
john --wordlist=/usr/share/john/password.lst hash.txt
```

If the wordlist approach doesn't find the password quickly, try incremental
mode (brute-force):
```bash
john --incremental hash.txt
```

The password is likely a simple word (not a complex random string). Monitor
progress:
```bash
john --show hash.txt
# Shows cracked passwords
```

### 4. Extract the archive (≈ 2 min)

Once the password is known:
```bash
# Option A: Use the cracked password directly
7z x -p<password> -o/app secrets.7z

# Option B: Use john to show the password
john --show hash.txt
# Then use it with 7z
```

Or if john is still running and you have the password:
```bash
7z x -p"$(john --show hash.txt | head -1 | cut -d: -f2)" -o/app secrets.7z
```

### 5. Write the solution (≈ 1 min)

```bash
cat /app/secret_file.txt
# Copy the word exactly
cat /app/secret_file.txt > /app/solution.txt
```

Or in Python:
```python
with open("/app/secret_file.txt") as f:
    word = f.read().strip()
with open("/app/solution.txt", "w") as f:
    f.write(word)
```

### 6. Verify (≈ 1 min)

```bash
cat /app/solution.txt
# Should be a single word, no trailing newline issues
wc -c /app/solution.txt
```

## Verifier checklist (must all pass)

- [ ] `/app/solution.txt` exists and contains the exact word from `secret_file.txt`.
- [ ] The word matches the verifier's expected value (the actual content inside the archive).
- [ ] No extra whitespace, newlines, or formatting in `solution.txt`.

## Common pitfalls

1. **7z2john not found.** On some systems `7z2john` is installed as
   `/usr/sbin/7z2john` or only available in the `john` package (not
   `john-data`). Try `locate 7z2john` or install the full `john` package.
2. **Archive extraction fails due to wrong path.** The `-o` flag in 7z does
   not take a space: `-o/app` not `-o /app`.
3. **Trailing newline in solution.txt.** If `secret_file.txt` has no trailing
   newline but you add one via `cat > /app/solution.txt`, the verifier may
   flag a mismatch. Use `cat /app/secret_file.txt | tr -d '\n' > /app/solution.txt`
   or strip whitespace in Python.
4. **John crack takes too long.** If the password is a dictionary word, use
   a wordlist first. If the wordlist path is unknown, `find / -name "*.lst"
   -o -name "rockyou*" 2>/dev/null` or download rockyou.txt.
5. **Archive contains multiple files.** The task only cares about
   `secret_file.txt`. Do not write the wrong file's content.

## Quick sanity test

```bash
# Verify the solution file is clean
python3 -c "
with open('/app/solution.txt') as f:
    content = f.read()
print(f'Content: {repr(content)}')
print(f'Length: {len(content)}')
"
```

## Reference pointers

- John the Ripper usage: https://www.openwall.com/john/doc/
- 7z2john documentation: bundled with John the Ripper jumbo community edition.
- Inside the task container, the verifier checks the exact content of `/app/solution.txt`.
