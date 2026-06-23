---
name: tb-build-pov-ray
description: Build POV-Ray 2.2 from 1990s source archives on a modern Linux system. Use this skill whenever the task mentions building POV-Ray v2.2, compiling the Persistence of Vision Raytracer from source, downloading legacy source archives from povray.org or FTP mirrors, patching a 1990s-era C codebase for modern GCC, linking against svgalib or X11, or rendering `/app/deps/illum1.pov` to verify the build. The skill covers: locating the correct source archive, extracting to `/app/povray-2.2`, patching for modern compilers (K&R-style declarations, implicit ints, missing includes), configuring without X11 if headless, installing to `/usr/local/bin/povray`, and running the sanity render test.
---

# tb-build-pov-ray

Build POV-Ray 2.2 from 1990s source archives, patching for modern C compilers,
and install the binary so it can render the reference scene at `/app/deps/illum1.pov`.

## When this skill triggers

Use it when the user is dropped into the `build-pov-ray` Docker container and needs
to produce a working `/usr/local/bin/povray` binary. Do **not** use it for modern
POV-Ray 3.x builds or other raytracers -- this is specifically about the 2.2
legacy codebase, its particular build system (Unix makefiles in the `unix/`
subdirectory), and the compiler compatibility issues that arise from code written
in 1994.

## Goal (one sentence)

Download the POV-Ray 2.2 source archive, patch the legacy C code for a modern
GCC, build without errors, and install so that `/usr/local/bin/povray
+L/app/povray-2.2/povdoc/include +I/app/deps/illum1.pov +O/dev/null +P -V`
completes and prints rendering statistics.

## Required outputs

| File | Purpose |
|---|---|
| `/app/povray-2.2/` | Extracted source tree with all build artifacts. |
| `/usr/local/bin/povray` | Installed binary, functional. |
| Sanity render | The command with `+I/app/deps/illum1.pov` must complete successfully. |

## Recommended workflow

### 1. Locate the source archive (≈ 5 min)

The official source is available from povray.org mirrors or the Debian snapshot
archive. Look for:
- `povray-2.2.tar.gz` or `povray-2.2.tar.Z`
- FTP mirrors at `ftp.povray.org` or Internet Archive

```bash
wget https://www.povray.org/../povray-2.2.tar.gz
# or from a known mirror
```

Extract to `/app/povray-2.2`:
```bash
tar -xzf povray-2.2.tar.gz -C /app/
```

### 2. Survey the build system (≈ 3 min)

POV-Ray 2.2 places its Unix build files in the `unix/` subdirectory:
```bash
cd /app/povray-2.2/unix
ls Makefile* config* *.h
```

Read the Makefile to understand:
- Which targets exist (`all`, `povray`, `install`).
- Which libraries are expected (`-lX11`, `-lm`, possibly svgalib).
- What compiler flags are set.

### 3. Configure and patch (≈ 20 min)

Common legacy C issues in POV-Ray 2.2:
- **K&R-style function declarations**: `int foo(a, b) int a; char *b; { }`
  needs conversion to ANSI C or compilation with `-std=gnu89`.
- **Implicit function declarations**: Missing `#include <stdlib.h>`, `<string.h>`,
  `<stdio.h>` in many `.c` files.
- **Missing return types**: Functions defaulting to `int` (allowed in C89, warning
  in C99, error with some GCC versions). Add explicit return types.
- **`<varargs.h>` vs `<stdarg.h>`**: The 1990s used `varargs.h`; replace with
  `stdarg.h` and update the va_* macros.
- **Conflicting `getline`**: If glibc exposes `getline`, rename POV-Ray's local
  version to avoid conflict.

For a headless build (common in the Docker container):
- Disable X11 support in the Makefile or config header.
- Remove `-lX11` from linker flags.
- Define `NO_X11` or equivalent if the code has preprocessor guards.

### 4. Compile (≈ 15 min)

```bash
cd /app/povray-2.2/unix
make clean
make -j1   # single-threaded to see errors clearly
```

Iterate on compilation errors: patch, recompile, repeat.

### 5. Install (≈ 2 min)

```bash
cp povray /usr/local/bin/povray
# or use the Makefile's install target
```

### 6. Sanity test (≈ 2 min)

```bash
/usr/local/bin/povray +L/app/povray-2.2/povdoc/include +I/app/deps/illum1.pov +O/dev/null +P -V
```

Expected output: rendering statistics with no error messages.

## Verifier checklist

- [ ] Source tree exists at `/app/povray-2.2/`.
- [ ] Binary installed at `/usr/local/bin/povray` and executable.
- [ ] Rendering `/app/deps/illum1.pov` completes successfully (exit code 0).
- [ ] The rendered output matches the reference image (checked by verifier).
- [ ] `/app/deps/illum1.pov` is unmodified (verifier checks checksum).

## Common pitfalls

1. **Wrong POV-Ray version.** POV-Ray 3.x has a completely different build
   system (autoconf-based) and source layout. The task specifically requires
   version 2.2. Do not build 3.0, 3.5, or 3.6.
2. **Using the Debian binary package.** The task requires building from source.
   `apt-get install povray` will give you the wrong version (likely 3.x) and
   the verifier may reject it.
3. **`getline` conflict with glibc.** Modern glibc exposes `getline()` as a
   standard function. POV-Ray 2.2 defines its own `getline`. Rename the local
   version (e.g., to `pov_getline`) throughout the codebase.
4. **Forgetting the include path for rendering.** POV-Ray needs `+L` to locate
   include files (like `colors.inc`, `textures.inc`). The sanity command uses
   `+L/app/povray-2.2/povdoc/include` -- omitting this causes "cannot open
   include file" errors.
5. **Multi-threaded build confusion.** With `-j` the error messages interleave
   and become unreadable. Always debug with `-j1` first.

## Reference pointers

- POV-Ray 2.2 documentation: https://www.povray.org/documentation/
- The Internet Archive may have copies of `povray-2.2.tar.gz` if the official site is down.
- The `unix/README` or `unix/INSTALL` files inside the source tree explain the
  original build instructions.
- Inside the task container, the verifier renders `/app/deps/illum1.pov` and
  compares the output pixel-for-pixel against a reference PNG.
