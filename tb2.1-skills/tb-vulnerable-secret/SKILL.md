---
name: tb-vulnerable-secret
description: Analyze a binary executable to find and exploit a vulnerability (likely buffer overflow) to extract a hidden secret flag. Use this skill when the task mentions extracting a secret, buffer overflow, binary analysis, `/app/results.txt`, FLAG format (`FLAG{...}`), or interacting with an executable to discover hidden data. Also trigger when the user references reverse engineering, `objdump`, `gdb`, `strings`, `checksec`, input fuzzing, or authentication bypass via binary exploitation.
---

# tb-vulnerable-secret

Analyze a binary executable to find and exploit a vulnerability (likely a buffer
overflow) that reveals a hidden secret key, then write the key in `FLAG{...}`
format to `/app/results.txt`. This is a Terminal-Bench 2.1 task; the full task
lives at `tasks/vulnerable-secret/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `vulnerable-secret` Docker container
and needs to extract a hidden flag from a binary. Do **not** use it for
general CTF challenges, web exploitation, or network-based attacks -- this is
specifically about a local binary with an embedded secret.

## Goal (one sentence)

Exploit the binary to reveal its hidden `FLAG{...}` secret and write the flag
to `/app/results.txt`.

## Required outputs

| File | Purpose |
|---|---|
| `/app/results.txt` | Contains the extracted secret key in `FLAG{...}` format. |

## Recommended workflow

### 1. Reconnaissance (≈ 5 min)

Gather information about the binary:
```bash
file /path/to/binary           # Architecture, stripped?, dynamically linked?
strings /path/to/binary        # Look for FLAG, password, debug strings
strings /path/to/binary | grep -i flag
strings /path/to/binary | grep -i secret
objdump -d /path/to/binary     # Disassemble (if not stripped)
readelf -a /path/to/binary     # ELF sections, symbols, entry point
```

Check security mitigations:
```bash
checksec --file=/path/to/binary  # PIE, NX, stack canaries, RELRO, etc.
# Or manually:
readelf -l /path/to/binary | grep GNU_STACK  # NX bit
objdump -R /path/to/binary                    # GOT entries (FULL/Partial RELRO)
```

### 2. Understand the binary's behavior (≈ 5 min)

- Run it with various inputs:
  ```bash
  ./binary
  ./binary test
  echo "AAAA" | ./binary
  echo "password" | ./binary
  ```
- Note what it asks for, what output it gives, and how it responds to wrong input.
- Look for format string vulnerabilities: try `%x %x %x` as input.
- Try large inputs to check for buffer overflows:
  ```bash
  python3 -c "print('A'*100)" | ./binary
  python3 -c "print('A'*1000)" | ./binary
  # If it segfaults, you have a buffer overflow.
  ```

### 3. Find the vulnerability (≈ 10 min)

Common patterns in this type of challenge:

**Buffer overflow**: The binary reads user input into a fixed-size buffer without
bounds checking. Overflowing the buffer overwrites the return address or a local
variable (e.g., an authentication flag on the stack).

**Key technique**: If the binary has a local variable like `int authenticated = 0`
that is checked before revealing the secret, overflowing the input buffer can
overwrite this variable with a non-zero value, bypassing the check.

```bash
# Test with Python to craft exact payload lengths
python3 -c "print('A'*20 + '\x01\x00\x00\x00')" | ./binary
# Adjust the offset (20) based on the buffer-to-variable distance
```

**Format string**: If the binary passes user input directly to `printf`, use
`%n` to write arbitrary values, or `%x`/`%s` to leak stack data that may
contain the flag.

### 4. Exploit and extract (≈ 10 min)

Iterative approach:
1. Find the exact offset where the overflow reaches the authentication variable
   (if that is the vulnerability type).
2. Craft the payload to set the variable to a non-zero (authenticated) value.
3. If the flag is printed after authentication, capture it.
4. If the flag is stored at a specific memory address, use the vulnerability to
   read that address.

```bash
# Example: binary uses gets() with a 16-char buffer and has int auth after it
# Stack layout: [buffer: 16 bytes] [saved ebp: 4/8 bytes] [auth: 4 bytes]
# Overflow: buffer(16) + padding(4/8) + auth_value(4)
for i in $(seq 0 100); do
    python3 -c "print('A'*$i + '\x01\x00\x00\x00')" | ./binary 2>&1 | grep -i flag
done
```

### 5. Write the result (≈ 2 min)

- Once extracted, write the flag to the required file:
  ```bash
  echo -n "FLAG{extracted_secret}" > /app/results.txt
  ```
- Verify: `cat /app/results.txt` -- should show exactly `FLAG{...}`.

## Verifier checklist (must all pass)

- [ ] `/app/results.txt` exists.
- [ ] Contains a valid flag in `FLAG{...}` format.
- [ ] The flag exactly matches the hidden secret in the binary.

## Common pitfalls

1. **Overlooking the simplest vulnerability.** Many "secret extraction" binaries
   use a simple stack-based buffer overflow where overflowing a buffer overwrites
   an adjacent `authenticated` variable. Check the disassembly for local variable
   layout before reaching for ROP chains or shellcode.
2. **Searching `strings` but not following up.** `strings` may show the flag
   format, but the actual flag value is often obfuscated, XOR'd, or decoded at
   runtime. If `strings` shows nothing useful, the flag is likely constructed
   or decrypted during execution.
3. **Guessing offsets blindly.** Use a debugger (`gdb`) to determine the exact
   distance between the input buffer and the target variable/memory. Blind
   bruteforcing offsets can work but wastes time.
4. **Not checking for newline/terminator issues.** Some input functions (`fgets`,
   `scanf`) stop at newlines or null bytes. If your payload contains `\x00` or
   `\n`, it may be truncated. Craft payloads that avoid these characters or
   use alternative input methods.
5. **Assuming the flag is printed on success.** Some binaries require you to
   read the flag from memory (e.g., it's decrypted into a buffer but never
   printed). Use the vulnerability to leak memory contents rather than just
   triggering a "success" message.

## Reference pointers

- Binary analysis tools: `file`, `strings`, `objdump`, `readelf`, `checksec`,
  `gdb`, `strace`, `ltrace`.
- Buffer overflow basics: overwriting stack variables, understanding stack
  frame layout, function epilogue behavior.
- `strace ./binary` to see system calls (writes, reads) -- may reveal hidden
  file operations or output paths.
- `ltrace ./binary` to see library calls (gets, strcmp, printf) -- often
  reveals the comparison logic.
