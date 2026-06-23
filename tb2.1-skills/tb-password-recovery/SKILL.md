---
name: tb-password-recovery
description: Recover a deleted password file from a disk image using digital forensics command-line tools, then output all matching candidate passwords to `/app/recovered_passwords.txt`. Use this skill whenever the task mentions recovering a deleted file, searching for `launchcode.txt`, finding a password in the format `PASSWORD=XXXXXXXXXX` that is exactly 23 characters long, starts with "8XD", ends with "W54", and contains only uppercase letters and digits. Also trigger when the user references the `password-recovery` Docker container, asks about file recovery from disk images, or mentions digital forensics with `grep`, `strings`, `foremost`, `testdisk`, or `extundelete`.
---

# tb-password-recovery

Perform digital forensic recovery of a deleted password file from a disk image,
filtering for a password with known prefix/suffix/length constraints and writing
candidates to `/app/recovered_passwords.txt`. This is a Terminal-Bench 2.1
security/forensics task; the full task spec lives at `tasks/password-recovery/`
in the repo.

## When this skill triggers

Use it when the user is dropped into the `password-recovery` Docker container
and needs to recover a password from the deleted file `launchcode.txt` inside
the `/app` directory. The password has a known format and partial content.
Do **not** use it for general file recovery, memory forensics, or
network-packet capture — this task is specifically about recovering strings
from a deleted file on disk.

## Goal (one sentence)

Recover the deleted `launchcode.txt` from within the `/app` directory, extract
every string matching the password pattern `8XD...[10 uppercase/digit chars]...W54`
(total 23 characters, `PASSWORD=XXXXXXXXXX`), and write each candidate to
`/app/recovered_passwords.txt`, one per line.

## Required outputs

| File | Purpose |
|---|---|
| `/app/recovered_passwords.txt` | One candidate password per line matching the pattern. At minimum the correct password must appear. |

The verifier checks that the correct password is present in the output file.
Multiple candidates are allowed — the verifier searches for the correct
one among them.

## Recommended workflow

### 1. Survey the filesystem (≈ 2 min)

- Check what is mounted and where: `df -h`, `mount`.
- List the `/app` directory: `ls -la /app`.
- Check for any disk image files (`*.img`, `*.dd`, `*.raw`, `*.bin`).
- Run `file` on any suspicious files to identify disk images or dumps.
- Look for any README or clues about the file system type.

### 2. Extract raw strings from the disk (≈ 5 min)

```bash
# If there is a disk image file:
strings -n 23 /path/to/disk.img > /tmp/all_strings.txt

# Or search the entire /app directory recursively:
strings -n 23 -f /app/* /app/**/* > /tmp/all_strings.txt

# Or use grep on the raw device / disk:
grep -a -o 'PASSWORD=.\{10\}' /path/to/disk.img > /tmp/candidates.txt
```

`strings -n 23` extracts all printable strings of at least 23 characters,
matching the password length. The `-a` flag on `grep` treats binary as text.

### 3. Filter candidates by the password pattern (≈ 3 min)

The password format is:
- Exactly 23 characters total: `PASSWORD=XXXXXXXXXX` means the password value
  is 10 characters after the `PASSWORD=` prefix (total = 9 + 10 = 19 chars)?
  Actually "23 characters long" plus starts with "8XD" and ends with "W54".

Re-reading: "PASSWORD=XXXXXXXXXX" is the format in the file, and the password
(starts with "8XD", ends with "W54", exactly 23 chars, uppercase letters and
digits only). So the 23-character string is the value after `PASSWORD=`.

```bash
# Filter for lines containing the prefix and suffix
grep -E '^8XD[A-Z0-9]{18}W54$' /tmp/all_strings.txt > /app/recovered_passwords.txt

# Or more broadly, capture anything that looks like the password format:
grep -oE '8XD[A-Z0-9]{18}W54' /tmp/all_strings.txt | sort -u > /app/recovered_passwords.txt
```

The regex breakdown: `8XD` + 18 chars of `[A-Z0-9]` + `W54` = 23 characters
total.

### 4. Use forensic tools if strings/grep insufficient (≈ 5 min)

If `strings` and `grep` don't find the password, escalate to dedicated tools:

```bash
# foremost - recovers files by header/footer signatures
apt-get install -y foremost
foremost -i /path/to/disk.img -o /tmp/recovered
grep -r 'PASSWORD=' /tmp/recovered/

# testdisk / photorec - file carving
apt-get install -y testdisk
photorec /path/to/disk.img

# extundelete - if the deleted file was on an ext3/ext4 filesystem
apt-get install -y extundelete
extundelete /path/to/disk.img --restore-file /app/launchcode.txt
```

### 5. Validate and write output (≈ 2 min)

```bash
# Ensure the output file has the right format
cat /app/recovered_passwords.txt
# Verify each line matches the pattern
grep -E '^8XD[A-Z0-9]{18}W54$' /app/recovered_passwords.txt | sort -u > /tmp/validated.txt
mv /tmp/validated.txt /app/recovered_passwords.txt
```

## Verifier checklist

- [ ] `/app/recovered_passwords.txt` exists and is readable.
- [ ] The file contains the correct password that was in `launchcode.txt`.
- [ ] Each line is a valid candidate matching the pattern (at minimum the correct one).

## Common pitfalls

1. **Searching only the live filesystem.** A deleted file is not visible to
   `ls` or `find`. You must search the raw block device, the disk image, or
   unallocated space. Tools like `strings` on the disk image, `grep -a` on
   the raw device, or forensic carvers like `foremost`/`photorec` are needed.
2. **Wrong regex for the password pattern.** The password is exactly 23
   characters: starts with "8XD", ends with "W54", and contains only uppercase
   `[A-Z]` and digits `[0-9]`. That means `8XD` + 18 middle characters + `W54`
   = 23 total. Miscomputing the middle length (e.g., 17 or 19 chars) will
   miss the correct password or produce invalid candidates.
3. **Confusing the `PASSWORD=` prefix with the password itself.** The file
   contains `PASSWORD=XXXXXXXXXX`, but the 23-character password starts with
   `8XD`. The `PASSWORD=` is a label, not part of the 23-character value.
   The recovered password should be the value after the `=` sign.
4. **Not installing forensic tools.** The Docker image may not have
   `foremost`, `testdisk`, or `extundelete` pre-installed. If `strings`
   alone doesn't find the password due to fragmentation, install the
   appropriate tool for the filesystem type used.
5. **Assuming only one candidate.** The verifier allows multiple lines in
   `/app/recovered_passwords.txt` — one per line. It is safer to output all
   matching patterns than to guess the single correct one.

## Reference pointers

- `man strings`, `man grep` for binary file searching.
- Foremost wiki: file carving by header/footer signatures.
- TestDisk / PhotoRec documentation for partition recovery and file carving.
- Inside the task container, the verifier at `tests/test_outputs.py` is the
  ground truth.
- Task spec: `tasks/password-recovery/instruction.md`.
