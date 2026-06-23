---
name: tb-cancel-async-tasks
description: Implement an async task concurrency controller in Python with proper cleanup on cancellation, including handling of queued (not-yet-started) tasks. Use this skill whenever the task mentions async Python, `asyncio` semaphores/task groups, KeyboardInterrupt cleanup, cancelling running and pending tasks, `run_tasks(tasks, max_concurrent)`, or writing `/app/run.py` with a specific function signature. The skill covers: designing the async concurrency limiter with `asyncio.Semaphore`, wrapping tasks to guarantee cleanup runs even on `CancelledError`, handling the edge case where a KeyboardInterrupt cancels tasks that are still in the queue (not yet scheduled), and ensuring the file is importable as `from run import run_tasks`.
---

# tb-cancel-async-tasks

Implement an `async run_tasks(tasks, max_concurrent)` function in
`/app/run.py` that runs up to `max_concurrent` async tasks simultaneously,
with guaranteed cleanup execution even when cancelled -- including for tasks
that have not yet started.

## When this skill triggers

Use it when the user is dropped into the `cancel-async-tasks` Docker container
and needs to write `/app/run.py` containing `run_tasks`. Do **not** use it for
generic asyncio debugging or unrelated concurrency patterns -- this is
specifically about bounded-concurrency async task execution with
KeyboardInterrupt resilience and queued-task cleanup.

## Goal (one sentence)

Produce an importable `/app/run.py` defining `async def run_tasks(tasks:
list[Callable[[], Awaitable[None]]], max_concurrent: int) -> None` that runs
tasks with bounded concurrency and always calls cleanup handlers on every task
that was passed in, whether it started, completed, or was still queued when
cancellation occurred.

## Required outputs

| File | Purpose |
|---|---|
| `/app/run.py` | Contains the `run_tasks` async function, importable as `from run import run_tasks`. |
| Correct behavior | Tasks run at most `max_concurrent` at a time; cancellation triggers cleanup for all tasks. |

## Recommended workflow

### 1. Understand the signature and semantics (≈ 5 min)

The function signature:
```python
async def run_tasks(
    tasks: list[Callable[[], Awaitable[None]]],
    max_concurrent: int
) -> None:
    ...
```

Key requirements:
- Each element of `tasks` is a zero-argument async callable.
- At most `max_concurrent` tasks execute simultaneously.
- If a KeyboardInterrupt (or any cancellation) arrives, the function must:
  - Cancel all currently-running tasks.
  - Ensure every task's cleanup code still executes.
  - Properly handle tasks that were still in the queue (never started).

### 2. Design the implementation (≈ 10 min)

Core pattern -- use `asyncio.Semaphore` for concurrency limiting:

```python
import asyncio
from typing import Callable, Awaitable

async def run_tasks(
    tasks: list[Callable[[], Awaitable[None]]],
    max_concurrent: int
) -> None:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def _run_one(task: Callable[[], Awaitable[None]]) -> None:
        async with semaphore:
            await task()

    # Create all tasks upfront so they are tracked
    async_tasks = [asyncio.create_task(_run_one(t)) for t in tasks]

    try:
        # Wait for all to complete (or for cancellation)
        await asyncio.gather(*async_tasks)
    except asyncio.CancelledError:
        # Cancel all tracked tasks
        for t in async_tasks:
            t.cancel()
        # Wait for cancellations to propagate with cleanup
        await asyncio.gather(*async_tasks, return_exceptions=True)
        raise
```

### 3. Handle the queued-task edge case (≈ 10 min)

The critical nuance: a task waiting on the semaphore (queued, not yet running)
must still run its cleanup when cancelled. This means the semaphore acquisition
must be cancellable, and the wrapper must catch `CancelledError` to trigger
cleanup.

A robust wrapper pattern:
```python
async def _run_one(task: Callable[[], Awaitable[None]]) -> None:
    try:
        async with semaphore:
            await task()
    except asyncio.CancelledError:
        # If we were cancelled while waiting on the semaphore,
        # we still need to run cleanup. The task callable may
        # have internal cleanup; the task itself should handle
        # CancelledError internally for cleanup.
        # If the task is a simple callable with no built-in cleanup,
        # this edge case is handled by the task's own try/finally.
        raise
```

The task callables themselves should be structured as:
```python
async def my_task():
    try:
        # do work
        ...
    finally:
        # cleanup always runs
        ...
```

### 4. Write the file (≈ 5 min)

Write `/app/run.py` and verify it's importable:
```bash
python3 -c "from run import run_tasks; print('OK')"
```

### 5. Test the implementation (≈ 10 min)

Test basic concurrency:
```python
import asyncio

async def sample(i):
    print(f"start {i}")
    await asyncio.sleep(0.1)
    print(f"end {i}")

asyncio.run(run_tasks([lambda i=i: sample(i) for i in range(10)], max_concurrent=2))
```

Test cancellation with cleanup:
```python
async def task_with_cleanup(i):
    try:
        print(f"work {i}")
        await asyncio.sleep(10)
    finally:
        print(f"cleanup {i}")

async def canceller():
    await asyncio.sleep(0.1)
    raise KeyboardInterrupt

# Should see "cleanup" for all tasks, even ones never started.
```

Test import:
```bash
cd /app && python3 -c "from run import run_tasks; print(type(run_tasks))"
```

## Verifier checklist

- [ ] `/app/run.py` exists and is syntactically valid Python.
- [ ] `from run import run_tasks` succeeds.
- [ ] `run_tasks` is an async function with the correct signature.
- [ ] Tasks respect `max_concurrent` (never more than N running at once).
- [ ] On KeyboardInterrupt/cancellation, all tasks undergo cleanup.
- [ ] Tasks still in the queue (not yet acquired the semaphore) also get cleaned up.
- [ ] The function does not swallow `CancelledError` -- it propagates after cleanup.

## Common pitfalls

1. **Forgetting the queued-task case.** If tasks are waiting on the semaphore
   when cancellation arrives, they haven't started yet. A naive `TaskGroup`
   that only cancels running tasks will skip cleanup for these queued tasks.
   The verifier tests this specific edge case.
2. **Using `asyncio.wait_for` instead of proper cancellation.** Wrapping the
   whole call in a timeout ignores the requirement that KeyboardInterrupt (a
   `CancelledError` in asyncio) must trigger cleanup, not just a timeout.
3. **Swallowing `CancelledError` with `return_exceptions=True` and not
   re-raising.** `asyncio.gather(*tasks, return_exceptions=True)` suppresses
   the cancellation. If you use it for cleanup, you must still re-raise
   `CancelledError` afterward so the caller knows cancellation happened.
4. **No semaphore, unbounded concurrency.** If you use `asyncio.gather(*tasks)`
   without a semaphore, all tasks run at once regardless of `max_concurrent`.
   The verifier checks that concurrency is bounded.
5. **Non-async function or wrong signature.** The verifier inspects the function
   signature. It must be `async def` and accept exactly the typed parameters
   specified, even if type hints are stripped by the verifier's dynamic checks.

## Reference pointers

- Python asyncio documentation: https://docs.python.org/3/library/asyncio.html
- `asyncio.Semaphore`: https://docs.python.org/3/library/asyncio-sync.html#asyncio.Semaphore
- `asyncio.Task.cancel()`: https://docs.python.org/3/library/asyncio-task.html#asyncio.Task.cancel
- Inside the task container, the verifier runs the function with instrumented
  tasks that record their lifecycle events (started, completed, cleaned_up) and
  validates the expected sequence for both normal and cancelled runs.
