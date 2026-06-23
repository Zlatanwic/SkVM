---
name: tb-custom-memory-heap-crash
description: Debug and fix a C++ program that crashes in release mode (but not debug mode) due to a static initialization order fiasco involving custom memory allocators and STL locale facets. Use this skill whenever the task mentions a C++ crash in release mode only, static initialization order issues, custom memory allocators interacting with STL internals, the Static Initialization Order Fiasco, Valgrind memory leak checks, or modifying only `/app/user.cpp` to fix a crash. Also trigger when the user references `/app/main.cpp`, `/app/user.cpp`, release-vs-debug build discrepancies, or custom `libstdc++` builds. The skill covers: diagnosing static init order bugs, understanding how `std::locale` and `std::ios_base::Init` interact with custom allocators, using Valgrind to verify no memory leaks, and applying minimal fixes.
---

# tb-custom-memory-heap-crash

Fix a C++ program at `/app/` that crashes under release mode (`-O2 -DNDEBUG`)
but works fine in debug mode, caused by a static initialization order bug
between custom memory allocators and STL locale facets. This is a
Terminal-Bench 2.1 task; the full task spec lives at
`tasks/custom-memory-heap-crash/`.

## When this skill triggers

Use it when the user is dropped into the `custom-memory-heap-crash` Docker
container and needs to fix a release-only C++ crash by modifying only
`/app/user.cpp`. Do **not** use it for general C++ debugging, segfaults
caused by null pointers or buffer overflows, or unrelated memory issues —
this is specifically about the static initialization order fiasco between
custom allocators and the STL's internal locale/iostream initialization.

## Goal (one sentence)

Fix `/app/user.cpp` so the program runs without crashing in release mode and
passes Valgrind with zero memory leaks, without modifying any other file.

## Required outputs

| File | Purpose |
|---|---|
| `/app/user.cpp` (modified) | Fixed version that eliminates the static init order crash. No other files may be modified. |

The verifier compiles both release and debug builds and checks for crashes and
memory leaks.

## Recommended workflow

### 1. Reproduce the crash (≈ 3 min)

```bash
# Build both versions
g++ -std=c++17 -o /app/release /app/main.cpp /app/user.cpp -O2 -DNDEBUG \
  -L/usr/local/gcc-custom-release/lib64 -Wl,-Bstatic -lstdc++ -Wl,-Bdynamic -lm

g++ -std=c++17 -o /app/debug /app/main.cpp /app/user.cpp -g -O0 \
  -L/usr/local/gcc-custom-debug/lib64 -Wl,-Bstatic -lstdc++ -Wl,-Bdynamic -lm

# Run both
/app/debug     # Should work
/app/release   # Should crash
```

### 2. Diagnose with Valgrind and GDB (≈ 5 min)

```bash
# Valgrind (debug build)
valgrind --leak-check=full /app/debug

# GDB on the release binary (if symbols available)
gdb /app/release
(gdb) run
(gdb) bt   # Check the backtrace
```

Key diagnostic questions:
- Is there a segfault during construction of a static/global object?
- Does the crash happen before `main()` starts (init phase)?
- Is a custom allocator being called before it is fully initialized?
- Look for `std::locale`, `std::ios_base::Init`, or `std::numpunct` in the backtrace.

### 3. Understand the root cause (≈ 10 min)

The Static Initialization Order Fiasco occurs when:
- One translation unit has a global/static object that depends on another
  global/static object in a different translation unit.
- C++ does not guarantee the order of initialization across translation units.
- In release mode (`-O2`), the optimizer may inline or reorder code in ways
  that trigger the issue that debug mode (`-O0`, `-g`) avoids.

Common scenarios for this task:
- A custom allocator (defined in `user.cpp`) replaces `operator new`/`delete`.
- STL internals (like `std::locale` facets) allocate memory during static
  initialization, before the custom allocator is ready.
- In the custom `libstdc++` at `/usr/local/gcc-custom-release/`, the locale
  initialization path may differ from the debug build.

Read the source:
```bash
cat /app/main.cpp
cat /app/user.cpp
```

Also check the custom libstdc++ source at `/build/` for hints about what
differs between the release and debug builds.

### 4. Apply the fix (≈ 10 min)

Common fix strategies:

**Strategy A: Lazy initialization.** Ensure the custom allocator's internal
state is initialized on first use rather than at static init time:
```cpp
// Instead of:
static MyAllocator g_allocator;  // BAD: init order undefined

// Use:
MyAllocator& get_allocator() {
    static MyAllocator alloc;    // OK: initialized on first call (C++11 guarantees thread-safe init)
    return alloc;
}
```

**Strategy B: Use `std::ios_base::Init`.** If the crash involves iostreams or
locales, ensure `std::ios_base::Init` is constructed before the custom
allocator is used.

**Strategy C: Init priority attributes.** Use GCC's `init_priority` attribute
to control initialization order:
```cpp
__attribute__((init_priority(101))) MyAllocator g_allocator;
```

**Strategy D: The Nifty Counter pattern.** Use a Schwarz counter to ensure
the allocator is initialized exactly once before any use.

The actual fix depends on the specific code in `user.cpp`. The verifier checks
that:
- Release build runs without crash.
- Valgrind reports zero memory leaks.

### 5. Test the fix (≈ 5 min)

```bash
# Rebuild release
g++ -std=c++17 -o /app/release /app/main.cpp /app/user.cpp -O2 -DNDEBUG \
  -L/usr/local/gcc-custom-release/lib64 -Wl,-Bstatic -lstdc++ -Wl,-Bdynamic -lm

# Run release
/app/release  # Must succeed

# Rebuild debug
g++ -std=c++17 -o /app/debug /app/main.cpp /app/user.cpp -g -O0 \
  -L/usr/local/gcc-custom-debug/lib64 -Wl,-Bstatic -lstdc++ -Wl,-Bdynamic -lm

# Run debug
/app/debug    # Must also still work

# Valgrind on both
valgrind --leak-check=full --error-exitcode=1 /app/debug
valgrind --leak-check=full --error-exitcode=1 /app/release
```

## Verifier checklist (must all pass)

- [ ] `/app/user.cpp` is the only modified file.
- [ ] Release build compiles and runs without crash.
- [ ] Debug build compiles and runs without crash (existing behavior preserved).
- [ ] Valgrind reports no memory leaks for both builds.
- [ ] No other existing files in the system are modified.

## Common pitfalls

1. **Modifying the wrong file.** The spec says "You shall not modify any other
   existing files in the system except for `/app/user.cpp`." Modifying
   `main.cpp`, headers, or build scripts will fail the verifier.
2. **Fixing the debug build but not release.** The crash only manifests in
   release mode. Make sure you test with the release compilation flags (`-O2
   -DNDEBUG`).
3. **Introducing memory leaks.** Your fix must pass Valgrind. A quick
   workaround (like a `std::exit(0)` or ignoring the crash) may introduce
   leaks or other issues.
4. **Misunderstanding the custom libstdc++.** This system has TWO versions of
   `libstdc++`: one at `/usr/local/gcc-custom-release/` (with optimizations)
   and one at `/usr/local/gcc-custom-debug/` (without). The static link flag
   `-Wl,-Bstatic -lstdc++` means the allocator behavior may differ between
   builds due to the library itself, not just the optimization flags.
5. **Not reading `/build/` for clues.** The custom compiler source at `/build/`
   may reveal what is different about the locale/allocator initialization
   in the release vs debug libstdc++.

## Quick sanity test

```bash
# Final verification script
echo "=== Release build ==="
g++ -std=c++17 -o /app/release /app/main.cpp /app/user.cpp -O2 -DNDEBUG \
  -L/usr/local/gcc-custom-release/lib64 -Wl,-Bstatic -lstdc++ -Wl,-Bdynamic -lm
/app/release && echo "PASS: release runs" || echo "FAIL: release crashed"

echo "=== Debug build ==="
g++ -std=c++17 -o /app/debug /app/main.cpp /app/user.cpp -g -O0 \
  -L/usr/local/gcc-custom-debug/lib64 -Wl,-Bstatic -lstdc++ -Wl,-Bdynamic -lm
/app/debug && echo "PASS: debug runs" || echo "FAIL: debug crashed"

echo "=== Valgrind (release) ==="
valgrind --leak-check=full /app/release 2>&1 | grep -E "definitely lost|indirectly lost|ERROR SUMMARY"
```

## Reference pointers

- C++ Static Initialization Order Fiasco: https://isocpp.org/wiki/faq/ctors#static-init-order
- GCC `init_priority` attribute: https://gcc.gnu.org/onlinedocs/gcc/C_002b_002b-Attributes.html
- C++11 Magic Statics (thread-safe local static init): https://en.cppreference.com/w/cpp/language/storage_duration#Static_local_variables_(C++11)
- Inside the task container, `/build/` contains the custom compiler source.
