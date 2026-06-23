---
name: tb-build-pmars
description: Build pMARS (the portable Core War simulator) from Debian source packages with X11 support disabled. Use this skill whenever the task mentions building pMARS, compiling a Core War simulator, fetching Debian source packages, disabling X11/display dependencies in a Makefile, building headless, installing to `/usr/local/bin/pmars`, or running the `pmars -b -r 50` battle smoke test. The skill covers: locating the correct Debian package version, extracting the source tarball, patching the Makefile to remove `-lX11` and `-DGRAPHIC` flags, handling implicit function declarations in legacy C code, compiling, installing, and verifying the binary has no shared library dependency on X11.
---

# tb-build-pmars

Build the pMARS Core War simulator from Debian source packages, stripping out
X11 support so the binary runs headless and installs to `/usr/local/bin/pmars`.

## When this skill triggers

Use it when the user is dropped into the `build-pmars` Docker container and needs
to produce a working `/usr/local/bin/pmars` binary from Debian sources. Do **not**
use it for generic build-from-source tasks -- this is specifically about the
Debian-packaged pMARS source tree, X11-disabling patches, and the Core War battle
smoke test.

## Goal (one sentence)

Extract the pMARS source from Debian packages, build it without X11 dependencies,
and install the `pmars` binary so `pmars -b -r 50 -f flashpaper.red rave.red`
produces a "Results: X Y Z" output line.

## Required outputs

| File | Purpose |
|---|---|
| `/app/pmars-<version>/` | Extracted and possibly patched Debian source tree. |
| `/usr/local/bin/pmars` | Installed binary with no X11 library dependency. |
| Smoke-test output | `pmars -b -r 50 -f flashpaper.red rave.red | tail -n 1` prints "Results: X Y Z". |

## Recommended workflow

### 1. Survey the environment (≈ 2 min)

- Check available build tools: `gcc --version`, `make --version`.
- Check if `apt-get` is available for fetching source packages.
- Verify no existing X11 headers pollute the build: `pkg-config --libs x11` (should fail).

### 2. Fetch Debian source packages (≈ 5 min)

Since koth.org is unreliable, the task specifies Debian packages. Typical approach:
```bash
apt-get update
apt-get source pmars
# or download from Debian snapshot/pool:
# wget http://deb.debian.org/debian/pool/main/p/pmars/pmars_<version>.orig.tar.gz
# wget http://deb.debian.org/debian/pool/main/p/pmars/pmars_<version>.diff.gz
```

Extract the source to `/app/pmars-<version>/`:
```bash
tar -xzf pmars_*.orig.tar.gz -C /app/
mv /app/pmars-* /app/pmars-<version>
```

### 3. Patch out X11 dependencies (≈ 10 min)

Inspect the Makefile:
```bash
grep -n "X11\|GRAPHIC\|DISPLAY" Makefile
```

Common changes:
- Remove `-lX11` from `LDFLAGS` or linker lines.
- Remove `-DGRAPHIC` or similar X11-related preprocessor defines.
- Delete or comment out references to X11 header directories.
- If the code uses `#ifdef GRAPHIC` guards, ensure they resolve to the headless path.
- Handle any `-lm` (math library) that may have been grouped with X11 libs -- keep `-lm`.

### 4. Compile (≈ 5 min)

```bash
cd /app/pmars-<version>
make clean
make
```

Common legacy C issues:
- Implicit function declarations: add `#include` directives or pass `-std=gnu89`.
- Missing `-lm` for math functions (pow, sqrt).
- `sprintf` / `strcpy` deprecation warnings (can usually be ignored if they compile).

### 5. Install (≈ 1 min)

```bash
cp pmars /usr/local/bin/pmars
chmod +x /usr/local/bin/pmars
```

### 6. Smoke test (≈ 1 min)

```bash
pmars -b -r 50 -f flashpaper.red rave.red | tail -n 1
```

Expected output: `Results: X Y Z` where X, Y, Z are integers.

### 7. Verify no X11 dependency (≈ 1 min)

```bash
ldd /usr/local/bin/pmars | grep -i x11    # should produce no output
ldd /usr/local/bin/pmars | grep -i xcb    # should produce no output
```

## Verifier checklist

- [ ] Source tree exists at `/app/pmars-<version>/`.
- [ ] Binary installed at `/usr/local/bin/pmars` and is executable.
- [ ] `pmars -b -r 50 -f flashpaper.red rave.red | tail -n 1` outputs "Results: X Y Z".
- [ ] Binary has no linked X11 or XCB shared libraries.
- [ ] Source originates from Debian packages (not from koth.org directly).

## Common pitfalls

1. **Using the koth.org source.** The official site is unreliable; the task
   explicitly requires Debian packages. Fetching from koth.org may produce a
   different source tree that the verifier rejects.
2. **Leaving `-lX11` in the linker flags.** Even if the code compiles without
   X11 headers, the binary may still have a DT_NEEDED entry for libX11 if the
   linker flag remains. The verifier checks for this. Always remove the flag.
3. **Not handling the `-lX11` → `-lm` dependency chain.** Some Makefiles group
   math and X11 libraries together (e.g., `-lX11 -lm`). When removing `-lX11`,
   ensure `-lm` stays if math functions are used.
4. **Building without `make clean` first.** Stale object files from a failed
   X11-enabled build can produce confusing linker errors. Always clean before
   the final build.
5. **Incorrect extraction path.** The verifier expects the source tree at an
   `/app/pmars-<version>/` path. Extracting to a different directory name
   (like `/app/pmars/`) may cause the verifier to miss the source tree.

## Reference pointers

- Debian package archive: https://packages.debian.org/search?keywords=pmars
- pMARS official site (for reference only -- don't use for source): http://www.koth.org/pmars/
- Core War standards: http://www.koth.org/info/icws94.html
- Inside the task container, the verifier checks the Debian provenance, the X11
  library absence via `ldd`, and the battle smoke test output.
