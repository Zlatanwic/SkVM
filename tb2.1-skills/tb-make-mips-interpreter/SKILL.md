---
name: tb-make-mips-interpreter
description: Implement a complete MIPS32 interpreter in JavaScript (vm.js) that can execute a DOOM ELF binary, handle Linux system calls (open/read/write/brk/exit), and render frames as BMP files. Use this skill whenever the task mentions writing a MIPS interpreter, vm.js, MIPS emulator, executing doomgeneric_mips, MIPS system call handling, or rendering DOOM frames from an ELF binary. Also trigger for the alexgshaw/make-mips-interpreter:20251031 Docker image or references to implementing a MIPS VM in JavaScript from scratch.
---

# tb-make-mips-interpreter

Implement a MIPS32 interpreter in JavaScript (`vm.js`) that loads a
`doomgeneric_mips` ELF, decodes MIPS instructions, handles Linux system calls,
and renders DOOM frames as `/tmp/frame.bmp`. This is a Terminal-Bench 2.1 hard
software-engineering task; the full task lives at `tasks/make-mips-interpreter/`.

## When this skill triggers

Use it when the user is dropped into the `make-mips-interpreter` container and
needs to write `vm.js` from scratch. Do **not** use it for general MIPS
assembly programming, QEMU-based emulation, or other CPU architectures (ARM,
x86, RISC-V).

## Goal (one sentence)

Write a JavaScript MIPS emulator (`vm.js`) that loads the `doomgeneric_mips` ELF,
decodes and executes its instructions correctly, implements the subset of Linux
system calls DOOM needs, and produces valid `/tmp/frame.bmp` output.

## Required outputs

| File | Purpose |
|---|---|
| `vm.js` | MIPS interpreter in JavaScript. Must load `doomgeneric_mips`, decode MIPS instructions, handle syscalls, and manage virtual memory. |
| `/tmp/frame.bmp` | Frame file produced by running `node vm.js`. Verifier checks this to confirm correct execution. |

## Recommended workflow

### 1. Survey the inputs (≈ 5 min)

- Inspect the provided `doomgeneric_mips` ELF: `file doomgeneric_mips`,
  `llvm-readelf -h doomgeneric_mips`, `llvm-objdump -d doomgeneric_mips`.
  Understand the instruction set (MIPS32? MIPS64?), endianness, and entry
  point.
- Inspect the `doomgeneric/` source to understand what syscalls DOOM uses
  (`open`, `read`, `write`, `close`, `brk`, `sbrk`, `exit`, `mmap`).
- Check if any reference or skeleton `vm.js` is provided in the container.

### 2. Design the interpreter architecture (≈ 5 min)

A clean MIPS interpreter in JS needs these components:

1. **ELF loader** — parse the ELF header, load program segments into a
   virtual memory buffer (`Uint8Array` or similar).
2. **Instruction decoder** — decode MIPS I-type, R-type, and J-type
   instructions from 32-bit words.
3. **Register file** — 32 general-purpose registers (GPRs), HI/LO (for
   `mult`/`div`), PC (program counter).
4. **Execution loop** — fetch, decode, execute, repeat. Must handle branches,
   jumps, and the branch delay slot (critical for MIPS correctness).
5. **Syscall handler** — trap on `syscall` instruction, read syscall number
   from `$v0`, dispatch to emulated Linux syscalls.
6. **Memory-mapped I/O** — `vm.js` may need to map certain addresses for
   framebuffer or device access.

### 3. Implement instruction decoding (≈ 30 min)

Cover at minimum these instruction families:

- **Arithmetic**: `add`, `addu`, `sub`, `subu`, `addi`, `addiu`, `mult`,
  `div`, `mflo`, `mfhi`.
- **Logical**: `and`, `or`, `xor`, `nor`, `andi`, `ori`, `xori`, `sll`,
  `srl`, `sra`.
- **Memory**: `lw`, `sw`, `lb`, `sb`, `lui`.
- **Control**: `beq`, `bne`, `blez`, `bgtz`, `j`, `jal`, `jr`, `jalr`,
  `slt`, `slti`.
- **System**: `syscall`.
- **Branch delay slot**: after every branch/jump, the next instruction
  ALWAYS executes. This is the most common MIPS emulation bug.

```javascript
// Sketch of decode + execute loop
while (true) {
  const instr = readWord(regs.pc);
  regs.pc += 4;
  const opcode = (instr >>> 26) & 0x3f;
  // ... decode and execute ...
  // syscall dispatch
  if (opcode === 0 && funct === 0xc) {
    handleSyscall(regs.v0);
  }
}
```

### 4. Implement system calls (≈ 20 min)

DOOM needs these Linux/MIPS syscalls (numbers from asm/unistd.h for MIPS):

| Syscall | MIPS number | Behavior |
|---|---|---|
| `sys_exit` | 4001 | Exit process |
| `sys_read` | 4003 | Read from fd |
| `sys_write` | 4004 | Write to fd |
| `sys_open` | 4005 | Open file |
| `sys_close` | 4006 | Close fd |
| `sys_brk` | 4045 | Change program break (malloc) |
| `sys_fstat` | 4108 | Get file status |
| `sys_mmap2` | 4210 | Memory map |

Implement a virtual filesystem for `open`/`read`/`write`:

```javascript
const fds = {
  0: { data: "", pos: 0 },  // stdin
  1: { data: "", pos: 0 },  // stdout
  2: { data: "", pos: 0 },  // stderr
};
// open() adds entries; read/write operate on them
```

The frame output goes through `write()` to a file descriptor that maps to
`/tmp/frame.bmp` on the host filesystem.

### 5. Handle DOOM-specific needs (≈ 15 min)

- **WAD file loading**: DOOM opens and reads its IWAD. Ensure the virtual
  FS can serve the WAD file from disk.
- **Frame output**: `doomgeneric_img.c` writes BMP data. Intercept the
  file descriptor used for frame output and persist it to disk.
- **Memory layout**: DOOM expects a heap (`brk`/`sbrk`). The initial break
  should be set after the BSS segment.

### 6. Test and iterate (≈ 10 min)

```bash
node vm.js
```

Check `/tmp/frame.bmp`:
```bash
file /tmp/frame.bmp  # should say "PC bitmap, Windows 3.x format"
```

The verifier inspects the first rendered frame for correctness.

## Verifier checklist (must all pass)

- [ ] `vm.js` exists and is syntactically valid JavaScript.
- [ ] `node vm.js` loads `doomgeneric_mips` without crashing.
- [ ] The MIPS instruction set is complete enough to execute DOOM.
- [ ] Branch delay slots are handled correctly.
- [ ] Required syscalls are implemented.
- [ ] `/tmp/frame.bmp` is created and contains valid BMP data.
- [ ] The frame matches expected content (DOOM title screen).

## Common pitfalls

1. **Ignoring the branch delay slot.** MIPS executes the instruction
   immediately after every branch/jump. If the emulator skips it, control
   flow breaks, DOOM crashes or behaves incorrectly. This is the #1 MIPS
   emulation bug.
2. **Wrong MIPS syscall numbers.** MIPS uses different syscall numbers from
   x86 Linux (e.g., `write` is 4004 on MIPS, not 4). Using x86 numbers will
   cause wrong syscall dispatch and silent failures.
3. **Missing the ELF interpreter path.** If `vm.js` tries to load the ELF
   as raw binary (ignoring the ELF header and program headers), it will
   execute garbage. Parse the ELF header properly, load segments at their
   `p_vaddr`, and start at `e_entry`.
4. **Incomplete register width.** MIPS registers are 32-bit. JavaScript
   numbers are 64-bit floats. Use `>>> 0` to enforce 32-bit unsigned
   semantics after every arithmetic operation, otherwise sign extension
   and overflow behave differently from real MIPS.
5. **Not handling unaligned memory access.** MIPS `lw`/`sw` require
   word-aligned addresses. The emulator should trap or handle misaligned
   accesses rather than silently reading wrong data.

## Reference pointers

- MIPS32 Architecture for Programmers (MIPS Technologies).
- Linux/MIPS syscall table: `/usr/include/asm/unistd.h` or
  https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/arch/mips/include/uapi/asm/unistd.h
- ELF specification for parsing program headers.
- Inside the container: `llvm-objdump -d doomgeneric_mips` to see the
  actual instructions the binary contains and verify your decoder handles
  them all.
