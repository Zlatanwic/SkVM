---
name: tb-make-doom-for-mips
description: Cross-compile the DOOM game engine for MIPS architecture using an LLVM toolchain and produce a `doomgeneric_mips` ELF binary that runs inside a JavaScript MIPS emulator (vm.js). Use this skill whenever the task mentions cross-compiling DOOM for MIPS, doomgeneric, doomgeneric_mips, doomgeneric_img.c, frame.bmp, MIPS ELF, LLVM cross-compilation, or running `node vm.js`. Also trigger for the alexgshaw/make-doom-for-mips:20251031 Docker image or references to building a MIPS target from doomgeneric source.
---

# tb-make-doom-for-mips

Cross-compile the `doomgeneric` DOOM engine source to a MIPS32 big-endian ELF
binary named `doomgeneric_mips`, using the provided LLVM/Clang toolchain, so
that a JavaScript MIPS emulator (`vm.js`) can execute it and render frames to
`/tmp/frame.bmp`. This is a Terminal-Bench 2.1 hard software-engineering task;
the full task lives at `tasks/make-doom-for-mips/`.

## When this skill triggers

Use it when the user is dropped into the `make-doom-for-mips` container and
needs to produce a runnable `doomgeneric_mips` ELF. Do **not** use it for
generic MIPS cross-compilation, native x86 DOOM builds, or other game engine
ports (e.g., Chocolate Doom, PrBoom).

## Goal (one sentence)

Produce a MIPS ELF binary `doomgeneric_mips` from the provided `doomgeneric/`
source (using `doomgeneric_img.c` as the display backend) that, when run via
`node vm.js`, boots DOOM and writes rendered frames as `/tmp/frame.bmp`.

## Required outputs

| File | Purpose |
|---|---|
| `doomgeneric_mips` | MIPS ELF binary compiled from doomgeneric source. Must be runnable by `node vm.js`. |
| `/tmp/frame.bmp` | Frame file written by the running binary (checked by verifier for successful execution). |

## Recommended workflow

### 1. Survey the files (≈ 3 min)

- Inspect `/app/doomgeneric/` — this is the DOOM source with the custom
  `doomgeneric_img.c` display backend that writes frames as BMP.
- Inspect `/app/vm.js` — the JavaScript MIPS emulator. Understand what
  binary format it expects (MIPS ELF, likely 32-bit), what system calls it
  implements, and what filename it opens (`doomgeneric_mips`).
- Check available toolchain: `clang --version`, `llvm-objdump --version`,
  `mips-linux-gnu-gcc --version` or whatever cross-compiler is present.

### 2. Understand the target ABI (≈ 3 min)

The `vm.js` emulator expects a specific MIPS variant. Key questions:

1. **Endianness** — MIPS can be big-endian or little-endian. Inspect `vm.js`
   to see which it expects (often big-endian for academic MIPS).
2. **Word size** — 32-bit MIPS (`mipsel` or `mips`).
3. **Syscall convention** — `vm.js` implements a subset of Linux/POSIX
   syscalls (`open`, `read`, `write`, `close`, `brk`, `exit`, etc.). Make
   sure the compiled binary uses syscall numbers matching what `vm.js`
   handles.
4. **Static linking required** — the emulator likely does not have a dynamic
   linker, so the ELF must be statically linked.

### 3. Set up the cross-compilation toolchain (≈ 10 min)

If the container has Clang/LLVM:

```bash
# For big-endian MIPS32 with static linking
clang --target=mips-unknown-linux-gnu \
      -static \
      -nostdlib \
      -o doomgeneric_mips \
      doomgeneric/*.c \
      -I doomgeneric/ \
      ...
```

If a GCC cross-compiler is present (`mips-linux-gnu-gcc`):

```bash
mips-linux-gnu-gcc -static -o doomgeneric_mips doomgeneric/*.c ...
```

Critical flags:
- `-static`: no dynamic linking.
- `-nostdlib` or provide a minimal libc: `vm.js` may implement its own
  syscall layer.
- `-march=mips32` or appropriate MIPS ISA level.
- No floating-point if the emulator only handles integer instructions.

### 4. Resolve compilation errors iteratively (≈ 20 min)

Common issues when cross-compiling doomgeneric:

1. **Missing libc symbols** — `vm.js` may provide a stub libc. If not,
   you may need to provide minimal implementations of `memcpy`, `memset`,
   `malloc`, `free`, etc. using the syscalls `vm.js` exports.
2. **File I/O** — DOOM needs to read the WAD file. `vm.js` likely
   intercepts `open`/`read`/`write` syscalls. Ensure the WAD path is
   hardcoded or passed correctly.
3. **Display output** — `doomgeneric_img.c` writes BMP frames. Verify
   this file is compiled in (not the SDL/X11 backend).
4. **Start symbol** — Ensure the ELF entry point matches what `vm.js`
   expects (usually `_start`).

### 5. Test execution (≈ 5 min)

```bash
node /app/vm.js
```

Check that `/tmp/frame.bmp` is created and contains valid BMP data. The
verifier checks this file to confirm DOOM booted successfully.

## Verifier checklist (must all pass)

- [ ] `doomgeneric_mips` exists and is a valid MIPS ELF binary.
- [ ] `node vm.js` runs without crashing.
- [ ] `/tmp/frame.bmp` is created by the running binary.
- [ ] The frame content matches expected output (DOOM title screen or first
      rendered frame).

## Common pitfalls

1. **Wrong endianness.** If `vm.js` expects big-endian MIPS but the compiler
   produces little-endian, the emulator will misinterpret instructions and
   crash immediately. Check `vm.js`'s instruction decoding to confirm.
2. **Not statically linked.** The emulator does not have a dynamic linker
   (`ld.so`). If the ELF has `INTERP` header requesting a dynamic linker,
   execution fails at startup. Always use `-static`.
3. **Compiling the wrong display backend.** `doomgeneric` ships with multiple
   backends (SDL, X11, etc.). The task requires `doomgeneric_img.c` which
   writes BMP frames. If the wrong backend is linked, no `/tmp/frame.bmp`
   appears and the verifier fails.
4. **Missing WAD file handling.** DOOM needs game data (I WAD). If the
   emulator's virtual filesystem or the hardcoded path does not point to the
   WAD, DOOM silently fails or exits early. Verify the WAD path in the source
   matches what `vm.js` provides.
5. **Symbol conflicts with the emulator's built-in functions.** `vm.js` may
   inject its own implementations of some functions. If the compiled binary
   also defines them, the emulator may behave unexpectedly. Check `vm.js` for
   any JS-level overrides.

## Reference pointers

- doomgeneric project: https://github.com/ozkl/doomgeneric
- MIPS ELF specification and syscall ABI (Linux/MIPS).
- Inside the container: inspect `vm.js` for the syscall table, emulated
  instructions, and expected binary format.
- `llvm-objdump -h doomgeneric_mips` to verify ELF sections and entry point.
