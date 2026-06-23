---
name: tb-circuit-fibsqrt
description: Implement the Fibonacci-of-integer-square-root function as a logic-gate circuit using a custom gate description language. Use this skill whenever the task mentions writing a `.txt` file of logic gates, building combinatorial/sequential logic for mathematical functions, using `/app/sim` to simulate a gate network, implementing `fib(isqrt(N)) % 2^32`, generating circuits with fewer than 32,000 lines, or computing Fibonacci and integer square root in hardware-like gates. The skill covers: understanding the gate language (AND, OR, XOR, NOT, assignment), designing an integer square root circuit, designing a Fibonacci-sequence accumulator circuit, chaining them together, handling 32-bit modular arithmetic, writing to `/app/gates.txt`, and testing with the simulator on known test cases.
---

# tb-circuit-fibsqrt

Create a `/app/gates.txt` file containing a logic-gate circuit that computes
`fib(isqrt(N)) % 2^32` when simulated with `/app/sim N`, using fewer than
32,000 gate lines.

## When this skill triggers

Use it when the user is dropped into the `circuit-fibsqrt` Docker container and
needs to produce a gate-level circuit implementing `fib(isqrt(N)) mod 2^32`.
Do **not** use it for general Verilog/VHDL tasks or other circuit simulators --
this is specifically about the custom gate description language parsed by
`/app/sim`, where each line is an assignment to a wire, and the first 32 wires
are set from the binary representation of stdin.

## Goal (one sentence)

Write a gate file in the simulator's language that reads a 32-bit integer N,
computes its integer square root `isqrt(N)`, computes `fib(isqrt(N))` modulo
2^32, and outputs the result -- all within 32,000 gate lines.

## Required outputs

| File | Purpose |
|---|---|
| `/app/gates.txt` | The gate-level circuit description (< 32,000 lines). Each line is a gate assignment. |
| Correct simulation | `/app/sim 208` outputs `377`; `/app/sim 20000` outputs `1407432322`. |

## Recommended workflow

### 1. Understand the gate language (≈ 10 min)

The gate file format, line by line:
```
outX = outY          # copy/buffer: wire X gets wire Y's value
outX = 0             # constant 0
outX = 1             # constant 1
outX = ~outY         # NOT gate
outX = outY & outZ   # AND gate
outX = outY | outZ   # OR gate
outX = outY ^ outZ   # XOR gate
```

Rules:
- The first 32 outputs (`out0` through `out31`) are initialized from the 32-bit
  binary representation of the input integer N.
- After 32,000 simulation steps, the last 32 outputs are read as a 32-bit
  integer and printed.
- Each line defines exactly one output wire. Wires are just integers (the X in
  `outX`). You can reference any previously-defined wire.
- The gate count (lines) must be under 32,000.

### 2. Study the provided example (≈ 5 min)

The task mentions a provided example `/app/gates.txt` that prints `argv[1]/2`.
Study it to understand:
- How arithmetic operations (addition, division) are built from gates.
- How sequential logic (registers, counters) works over simulation steps.
- How wire numbering conventions help with modular design.

### 3. Design the integer square root circuit (≈ 20 min)

Integer square root `isqrt(N)` = floor(sqrt(N)).

Algorithm: iterative bit-by-bit method (digit recurrence):
- Process bits from most significant to least.
- Maintain a running result and remainder.
- For each bit, try subtracting `(result << 2) | (bit << 1) | 1` from the
  remainder; if the remainder stays positive, set that bit in the result.

This can be implemented in hardware as a state machine with ~32 iterations
(for a 32-bit input). Wire budget: approximately 200-500 gates per bit
= ~6,400-16,000 gates for the isqrt circuit.

Alternative: use a combinational isqrt (unrolled) which takes more gates
but fewer simulation steps.

### 4. Design the Fibonacci accumulator circuit (≈ 20 min)

Compute `fib(k)` where `k = isqrt(N)`.

Naive iterative approach:
- `a = 0, b = 1`
- For `i = 0` to `k-1`: `(a, b) = (b, a + b)`
- Return `a`

Hardware implementation:
- Need a 32-bit adder (built from gates).
- Need registers to hold `a` and `b` (using wire feedback loops).
- A counter to track iterations (compare against the output of isqrt).
- State machine: count down from `isqrt(N)` to 0, updating Fibonacci values.
- Handle `fib(0) = 0, fib(1) = 1` as base cases.

Modular arithmetic: the result is `fib(isqrt(N)) % 2^32`, which means you
only need to keep the low 32 bits of every addition -- overflow is automatic
if you only wire the low 32 bits.

### 5. Build a 32-bit adder (≈ 5 min)

A 32-bit ripple-carry adder can be built from:
- Full adders: `sum = a ^ b ^ cin`, `cout = (a & b) | (a & cin) | (b & cin)`.
- Each bit: ~5 gates. Total: ~160 gates.

### 6. Chain the circuits and test (≈ 15 min)

Connect the output of the isqrt circuit to the input of the Fibonacci circuit.
Wire the final Fibonacci result to the last 32 output wires.

Test commands:
```bash
/app/sim 208      # Expected: 377 (isqrt(208)=14, fib(14)=377)
/app/sim 20000    # Expected: 1407432322
/app/sim 0        # Expected: 0 (isqrt(0)=0, fib(0)=0)
/app/sim 1        # Expected: 1 (isqrt(1)=1, fib(1)=1)
```

### 7. Iterate and debug (≈ 30+ min)

If the output is wrong:
- Test isqrt in isolation first.
- Test Fibonacci in isolation.
- Check bit ordering (MSB vs LSB) when reading the input and writing the output.
- Verify that sequential logic has the correct number of cycles.
- Count gates: if approaching 32,000, optimize by reusing subcircuits.

## Verifier checklist

- [ ] `/app/gates.txt` exists and has fewer than 32,000 lines.
- [ ] Each line is a valid gate operation in the simulator's language.
- [ ] `/app/sim 208` outputs `377`.
- [ ] `/app/sim 20000` outputs `1407432322`.
- [ ] The circuit is self-contained (no external references beyond the gate file).

## Common pitfalls

1. **Gate count exceeding 32,000.** A naive fully-unrolled isqrt with Fibonacci
   can easily blow past the limit. Use sequential logic with iteration (state
   machines) to amortize gates across simulation cycles. Combinational isqrt
   alone can take 10,000+ gates if not careful.
2. **Incorrect bit ordering.** The first 32 output wires represent the binary
   input, but whether `out0` is the LSB or MSB matters critically. The example
   file reveals the convention. Getting this wrong inverts your input value.
3. **Fibonacci of 0 or 1 edge cases.** `fib(0) = 0`, `fib(1) = 1`. If your
   circuit doesn't handle these base cases (e.g., the isqrt of 0 is 0, and
   fib(0) should be 0), it may produce wrong results for small inputs.
4. **Unsigned overflow in the Fibonacci sequence.** fib(47) = 2,971,215,073
   exceeds 2^32, so for isqrt(N) >= 47 you need correct modular behavior.
   The task specifies `% 2^32`, which is natural if you only wire 32 bits of
   the adder output.
5. **Not enough simulation steps for sequential circuits.** If your circuit
   uses a state machine with K iterations, you need at least K simulation
   steps. With 32,000 steps available this is usually fine, but very long
   iteration chains (e.g., 32*32*2) might exceed the limit if not pipelined.

## Reference pointers

- The simulator `/app/sim` is a C program provided in the container. Its
  behavior is defined by the gate language described in the task.
- The example `gates.txt` included with the task demonstrates how to build
  a divider circuit using the gate language -- use it as a reference for
  arithmetic gate design patterns.
- Classical algorithms for hardware integer square root: digit-recurrence
  (non-restoring) method; see computer arithmetic textbooks.
- Inside the task container, the verifier runs `/app/sim` with multiple test
  inputs and compares stdout against expected values.
