---
name: tb-extract-elf
description: Parse an ELF binary file and extract initialized memory values from its executable sections, outputting them as a JSON object mapping memory addresses to integer values using Node.js. Use this skill whenever the task mentions parsing ELF binaries, extracting memory values from compiled C binaries, reading ELF section data, or producing a JSON map of addresses to integer values from an executable. Also trigger when the user references `extract.js`, `/app/a.out`, `out.json`, or needs to extract at least 75% of memory values from a compiled binary's loadable segments. The skill covers: understanding ELF file format (headers, program headers, sections), reading binary data in Node.js, parsing ELF structures, iterating over program headers to find loadable segments, and formatting address-value pairs as JSON.
---

# tb-extract-elf

Parse a compiled C binary (`/app/a.out`) in ELF format, extract initialized
memory values from its loadable segments, and write them as a JSON object
(address-to-integer mapping) to stdout via `extract.js`. This is a
Terminal-Bench 2.1 task; the full task spec lives at `tasks/extract-elf/`.

## When this skill triggers

Use it when the user is dropped into the `extract-elf` Docker container and
needs to write a Node.js script that parses an ELF binary and outputs
address-value pairs. Do **not** use it for general binary analysis with
`objdump` or `readelf`, patching binaries, or disassembly — this is
specifically about programmatically reading the ELF format and extracting
the loaded memory image.

## Goal (one sentence)

Write `extract.js` that reads an ELF binary, extracts initialized memory
values from executable/loadable sections, and outputs a JSON object mapping
virtual addresses to 4-byte integer values, covering at least 75% of the
reference solution's entries.

## Required outputs

| File | Purpose |
|---|---|
| `/app/extract.js` | Node.js script that takes the ELF binary path as a CLI argument and writes the address-value JSON to stdout. |

The output (via `node extract.js /app/a.out > out.json`) should be a JSON
object like:
```json
{"4194304": 1784774249, "4194308": 1718378344, ...}
```

## Recommended workflow

### 1. Understand ELF format (≈ 5 min)

ELF (Executable and Linkable Format) structure:

**ELF Header (64-bit):**
- Bytes 0-3: Magic `\x7fELF`
- Byte 4: Class (1=32-bit, 2=64-bit)
- Byte 5: Data encoding (1=little-endian, 2=big-endian)
- Byte 16-17: Type (2=executable, 3=shared object)
- Byte 24-31: Entry point address (64-bit)
- Byte 32-39: Program header offset
- Byte 40-47: Section header offset
- Byte 54-55: Size of program header entry
- Byte 56-57: Number of program header entries

**Program Header (64-bit):**
- Bytes 0-3: Type (1=PT_LOAD)
- Bytes 4-7: Flags (PF_X=1, PF_W=2, PF_R=4)
- Bytes 8-15: Offset in file
- Bytes 16-23: Virtual address (vaddr)
- Bytes 24-31: Physical address
- Bytes 32-39: File size (size in the file image)
- Bytes 40-47: Memory size (size in memory; may be larger than file size)
- Bytes 48-55: Alignment

The memory values come from PT_LOAD segments. The file data at `offset` of
length `file_size` should be mapped to virtual address `vaddr`. Each virtual
address maps to a byte in the segment data.

### 2. Write the ELF parser in Node.js (≈ 20 min)

```javascript
const fs = require("fs");

function parseELF(filePath) {
    const buf = fs.readFileSync(filePath);
    const result = {};

    // Verify ELF magic
    const magic = buf.toString('ascii', 0, 4);
    if (magic !== '\x7fELF') throw new Error('Not an ELF file');

    const is64 = buf[4] === 2;
    const isLE = buf[5] === 1;

    if (!is64) throw new Error('Only 64-bit ELF supported');

    // Read helper (little-endian or big-endian)
    function readUInt64(offset) {
        return isLE
            ? Number(buf.readBigUInt64LE(offset))
            : Number(buf.readBigUInt64BE(offset));
    }

    function readUInt32(offset) {
        return isLE ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
    }

    function readUInt16(offset) {
        return isLE ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
    }

    // Parse ELF header
    const phoff = readUInt64(32);   // Program header offset
    const phentsize = readUInt16(54); // Size of each entry
    const phnum = readUInt16(56);     // Number of entries

    // Iterate program headers
    for (let i = 0; i < phnum; i++) {
        const offset = phoff + i * phentsize;
        const type = readUInt32(offset);

        if (type === 1) { // PT_LOAD
            const fileOff = readUInt64(offset + 8);
            const vaddr = readUInt64(offset + 16);
            const fileSize = readUInt64(offset + 32);
            // const memSize = readUInt64(offset + 40);

            // Extract 4-byte integers at each address
            for (let j = 0; j + 4 <= fileSize; j += 4) {
                const addr = vaddr + j;
                const value = readUInt32(fileOff + j);
                result[addr.toString()] = value;
            }
        }
    }

    return result;
}

// Main
const filePath = process.argv[2];
if (!filePath) {
    console.error('Usage: node extract.js <elf-file>');
    process.exit(1);
}

const memory = parseELF(filePath);
console.log(JSON.stringify(memory));
```

### 3. Key details to get right (≈ 10 min)

- **Address granularity:** The example output shows addresses at 4-byte
  intervals (4194304, 4194308, ...). Each maps to a 4-byte integer. Iterate
  in 4-byte steps and read a uint32 at each position.
- **Only PT_LOAD segments:** Other segment types (PT_DYNAMIC, PT_INTERP, etc.)
  are not mapped to the process address space. Only PT_LOAD (type 1) segments
  contain the actual memory image.
- **Data from file, not memory:** Use `file_size` (bytes in file), not
  `mem_size` (bytes in memory). The `.bss` section (zero-initialized data)
  has `file_size < mem_size` and its "extra" memory is all zeros — but the
  task likely only cares about initialized (non-zero) data from the file.
- **Endianness:** Most ELF binaries are little-endian. Read the EI_DATA byte
  (byte 5) and handle both cases.

### 4. Handle edge cases (≈ 5 min)

- **64-bit only:** Check byte 4 (EI_CLASS). If 32-bit, use 32-bit header
  offsets (different struct sizes).
- **Multiple PT_LOAD segments:** A typical ELF has at least two loadable
  segments: one for code (.text) and one for data (.data, .rodata). Extract
  from all of them.
- **Address collisions:** Two segments should not overlap in the virtual
  address space, but if they do, the later one takes precedence (consistent
  with how the dynamic linker works).
- **Non-4-byte-aligned file_size:** Handle the case where `file_size` is not
  a multiple of 4. Only read full 4-byte integers.

### 5. Test and compare (≈ 5 min)

```bash
node extract.js /app/a.out > out.json
# Check output
python3 -c "
import json
with open('out.json') as f:
    data = json.load(f)
print(f'Extracted {len(data)} addresses')
# Verify a few values are integers
for addr, val in list(data.items())[:5]:
    print(f'0x{int(addr):x}: {val} (0x{val:08x})')
"

# Also check with readelf for comparison
readelf -l /app/a.out
```

### 6. Verify coverage (≈ 2 min)

The verifier checks:
1. Every address you output must have the correct value (precision requirement).
2. You must cover at least 75% of the reference solution's addresses (recall
   requirement).

Strategy: be inclusive — include all addresses from all PT_LOAD segments with
file data, rather than trying to filter. If you are unsure whether an address
should be included, include it (as long as the value is correct).

## Verifier checklist (must all pass)

- [ ] `extract.js` exists and runs without error.
- [ ] Output is valid JSON (object with string keys and integer values).
- [ ] At least 75% of the reference solution's addresses are present.
- [ ] For every address present, the integer value exactly matches the reference.
- [ ] Addresses and values are correctly extracted from the ELF binary (4-byte
      integers at 4-byte-aligned addresses in PT_LOAD segments).

## Common pitfalls

1. **Including .bss data.** The `.bss` section has `file_size` of 0 but a
   non-zero `mem_size`. Its memory values are all zeros. Including zero-fill
   entries may or may not be correct — the task likely expects only
   file-backed (initialized) data. Check whether the reference solution
   includes .bss addresses.
2. **32-bit vs 64-bit ELF.** A 64-bit ELF has 64-bit fields for addresses
   and offsets. Using 32-bit reads will give wrong values. Always check byte
   4 (EI_CLASS) and use the appropriate struct layout.
3. **Endianness.** Most binaries are little-endian, but the ELF header
   explicitly encodes this at byte 5. Not checking byte 5 means you'll get
   wrong values on big-endian binaries (rare, but possible in cross-compiled
   environments).
4. **Using Node.js Buffer methods incorrectly.** `buf.readUInt32LE` and
   `buf.readBigUInt64LE` are the correct methods. Using `readInt32LE`
   (signed) may produce negative values when the unsigned interpretation is
   expected. The example output shows large positive integers like
   `1784774249`, which are unsigned 32-bit values.
5. **Address format in JSON.** The example uses addresses as decimal strings
   (`"4194304"`, not `"0x400000"`). JSON object keys are always strings.
   Format addresses as decimal string representations.

## Quick sanity test

```bash
# Run the extractor
node extract.js /app/a.out > out.json

# Verify JSON structure
python3 << 'EOF'
import json

with open("out.json") as f:
    data = json.load(f)

# Check types
for addr, val in data.items():
    assert isinstance(addr, str), f"Key {addr} must be a string"
    assert addr.isdigit(), f"Key {addr} must be a decimal string"
    assert isinstance(val, int), f"Value {val} must be an integer"
    break

print(f"Total entries: {len(data)}")
print("First 5 entries:")
for addr, val in sorted(data.items(), key=lambda x: int(x[0]))[:5]:
    print(f"  {addr}: {val}")

# Verify with readelf
import subprocess
result = subprocess.run(["readelf", "-l", "/app/a.out"], capture_output=True, text=True)
print(result.stdout)
EOF
```

## Reference pointers

- ELF specification: https://refspecs.linuxfoundation.org/elf/elf.pdf
- ELF 64-bit header layout (man 5 elf on Linux).
- Node.js Buffer API: https://nodejs.org/api/buffer.html
- The verifier checks both precision (correct values for addresses you include)
  and recall (at least 75% coverage of the reference solution's addresses).
