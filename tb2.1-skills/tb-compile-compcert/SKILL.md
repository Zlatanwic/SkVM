---
name: tb-compile-compcert
description: Build the CompCert verified C compiler (version 3.13.1) from source under `/tmp/CompCert/`, configuring it for the host's operating system and instruction set architecture. Use this skill whenever the task mentions building CompCert from source, compiling a verified C compiler, installing Coq and OCaml dependencies, configuring CompCert for x86/ARM/RISC-V, running the `ccomp` frontend, or when the output must be invokable via `/tmp/CompCert/ccomp`. The skill covers: downloading the CompCert 3.13.1 source, installing OCaml, Coq, Menhir, and other build dependencies, running the configure script with the correct target architecture, building with `make`, and verifying the compiler can compile a simple C program.
---

# tb-compile-compcert

Build the CompCert 3.13.1 verified C compiler from source, configured for the
host system's architecture, so it is invokable as `/tmp/CompCert/ccomp`.

## When this skill triggers

Use it when the user is dropped into the `compile-compcert` Docker container
and needs to produce a working `/tmp/CompCert/ccomp` executable. Do **not** use
it for building GCC, Clang, or other compilers -- this is specifically about
the formally-verified CompCert C compiler, its OCaml/Coq build system, and the
architecture-specific configuration step.

## Goal (one sentence)

Download CompCert 3.13.1 source, install all build dependencies (OCaml, Coq,
Menhir), configure for the host ISA and OS, compile with `make`, and verify
that `/tmp/CompCert/ccomp` can compile a trivial C program.

## Required outputs

| File | Purpose |
|---|---|
| `/tmp/CompCert/` | Source tree with full build artifacts. |
| `/tmp/CompCert/ccomp` | The CompCert compiler driver, executable and functional. |
| Verification | `ccomp` successfully compiles a simple C file and produces a runnable binary. |

## Recommended workflow

### 1. Install build dependencies (≈ 10 min)

CompCert 3.13.1 requires a specific toolchain:
```bash
apt-get update
apt-get install -y \
  ocaml ocaml-native-compilers \
  coq coq-native \
  menhir \
  libgmp-dev \
  make gcc
```

Alternative -- install via OPAM (OCaml package manager):
```bash
apt-get install -y opam
opam init --disable-sandboxing -y
eval $(opam env)
opam install -y coq=8.17.1 menhir
```

Verify versions:
```bash
ocamlc --version     # Should be >= 4.09
coqc --version       # Should be compatible with CompCert 3.13.1 (Coq 8.16-8.18)
menhir --version     # Should be >= 20201216
```

### 2. Download CompCert 3.13.1 (≈ 3 min)

```bash
cd /tmp
wget https://github.com/AbsInt/CompCert/archive/refs/tags/v3.13.1.tar.gz
tar -xzf v3.13.1.tar.gz
mv CompCert-3.13.1 CompCert
cd CompCert
```

### 3. Determine the target architecture (≈ 3 min)

CompCert supports: x86 (32-bit), x86_64, ARM (v6/v7/v8), RISC-V (32/64-bit),
PowerPC, AArch64.

Detect the host architecture:
```bash
uname -m          # x86_64, aarch64, armv7l, riscv64
gcc -dumpmachine  # x86_64-linux-gnu, etc.
```

This informs the `-target` flag for configure.

### 4. Configure CompCert (≈ 5 min)

```bash
./configure \
  x86_64-linux \          # or aarch64-linux, arm-linux, riscv64-linux, etc.
  -prefix /tmp/CompCert
```

Common target triples:
- `x86_64-linux` for 64-bit x86.
- `x86_32_bits-linux` for 32-bit x86 only.
- `aarch64-linux` for 64-bit ARM.
- `armv7-linux` for 32-bit ARM v7.
- `riscv64-linux` for 64-bit RISC-V.

The configure script may also need:
- `-clightgen` to build the Clight generation tool.
- `-no-runtime-lib` if you only need the compiler without the runtime.

If the configure script complains about missing Coq or OCaml versions:
- Check `coqc --version` matches the required Coq version.
- Use `opam switch` to create a compatible OCaml environment.

### 5. Build (≈ 30 min)

```bash
make -j$(nproc)
```

This compiles the Coq proofs (which takes most of the time) and then the
OCaml extraction. On 2 CPUs, expect 15-30 minutes.

If the build fails:
- **Out of memory**: Limit parallelism: `make -j1`.
- **Coq version mismatch**: Install the exact Coq version CompCert 3.13.1
  expects. Check `README.md` or `INSTALL.md` inside the source.
- **Missing Menhir**: Install `menhir` via apt or opam.
- **Proof failure**: This shouldn't happen with a release tarball; if it
  does, the Coq version is probably wrong.

### 6. Install (≈ 1 min)

```bash
make install
# or manually:
# cp ccomp /tmp/CompCert/
```

The `ccomp` binary should be at `/tmp/CompCert/ccomp` (if using the default
build directory layout, it may be at `./ccomp` in the source tree, or
installed to the prefix `bin/` directory).

### 7. Verify the compiler works (≈ 3 min)

```bash
# Create a trivial C program
cat > /tmp/test.c << 'EOF'
#include <stdio.h>
int main() {
    printf("Hello from CompCert!\n");
    return 0;
}
EOF

/tmp/CompCert/ccomp /tmp/test.c -o /tmp/test
/tmp/test
```

Expected output: `Hello from CompCert!`

Also verify the version:
```bash
/tmp/CompCert/ccomp --version
# Should show CompCert 3.13.1
```

### 8. Ensure the binary path is correct (≈ 1 min)

The task requires CompCert to be invokable through `/tmp/CompCert/ccomp`:
```bash
ls -la /tmp/CompCert/ccomp
# If it's a symlink or in a subdirectory, adjust:
# If ccomp is at /tmp/CompCert/bin/ccomp, create a symlink:
ln -sf /tmp/CompCert/bin/ccomp /tmp/CompCert/ccomp
```

## Verifier checklist

- [ ] `/tmp/CompCert/` exists and is a built CompCert source tree.
- [ ] The source is CompCert 3.13.1 (verifier may check version output).
- [ ] `/tmp/CompCert/ccomp` exists and is executable.
- [ ] CompCert was built from source (not copied from a binary package).
- [ ] The compiler is configured for the host architecture.
- [ ] A simple C program compiles and runs correctly with `ccomp`.

## Common pitfalls

1. **Wrong Coq version.** CompCert 3.13.1 is certified against a specific
   Coq version (likely 8.16.x or 8.17.x). Using the system Coq (which may
   be newer, like 8.19) can cause proof script errors. Install the exact
   required version via OPAM.
2. **Binary not at the expected path.** The verifier expects `/tmp/CompCert/ccomp`.
   If `make install` puts it at `/tmp/CompCert/bin/ccomp`, create a symlink.
   If the source tree has it at the root, copy or link it.
3. **Building with insufficient memory.** CompCert's Coq proofs consume
   significant memory. With only 4096 MB available, use `-j1` to avoid OOM
   during proof checking.
4. **Using a pre-built binary.** The task requires building from source.
   Downloading a pre-compiled `ccomp` binary will be detected by the verifier
   (it checks for build artifacts in `/tmp/CompCert/`).
5. **Wrong target architecture.** Configuring for `x86_64-linux` on an
   AArch64 machine, or vice versa, will either fail to build or produce a
   compiler that targets the wrong ISA. Always match `uname -m` output.
6. **OCaml environment not properly set up.** If using OPAM, the environment
   variables (`PATH`, `OCAMLPATH`) must be set. Run `eval $(opam env)` before
   `./configure` and `make`.

## Reference pointers

- CompCert official site: https://compcert.org/
- CompCert GitHub releases: https://github.com/AbsInt/CompCert/releases (v3.13.1)
- CompCert installation instructions: `INSTALL.md` inside the source tarball.
- Inside the task container, the verifier checks that `/tmp/CompCert/ccomp`
  is a freshly-built binary, tests compilation of a known C file, and may
  verify the target architecture matches the environment.
