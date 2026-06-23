---
name: tb-headless-terminal
description: Implement a Python `HeadlessTerminal(BaseTerminal)` class that provides a headless interactive bash shell with support for modifier keys (e.g., Ctrl-C as `\x03`), sourcing of startup files like `~/.bashrc`, and state persistence between commands. Use this skill whenever the task mentions a headless terminal, a Python interface to send keystrokes to a bash shell, implementing a `BaseTerminal` subclass, using `pty` or `pexpect` for pseudo-terminal interaction, or creating `/app/headless_terminal.py` with a class importable as `from headless_terminal import HeadlessTerminal`. Also trigger when the user references interactive shell automation, sending control characters to processes, or maintaining shell state across multiple command invocations.
---

# tb-headless-terminal

Implement a Python class that wraps an interactive bash shell inside a
pseudo-terminal, allowing programmatic keystroke injection with full support
for modifier keys, interactive programs, and shell startup file sourcing.
This is one of the Terminal-Bench 2.1 task skills; the full task lives at
`tasks/headless-terminal/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `headless-terminal` Docker container
and needs to deliver `/app/headless_terminal.py` with a `HeadlessTerminal`
class that inherits from a provided `BaseTerminal`. Do **not** use it for
generic Python subprocess management, simple `subprocess.run()` wrappers, or
non-interactive command execution.

## Goal (one sentence)

Create a `HeadlessTerminal` class backed by a persistent PTY that launches an
interactive bash shell, sources `~/.bashrc` and other startup files, accepts
arbitrary keystrokes including control characters, and preserves shell state
(environment variables, working directory, aliases) across multiple command
invocations.

## Required outputs

| File | Purpose |
|---|---|
| `/app/headless_terminal.py` | Python module containing `HeadlessTerminal(BaseTerminal)` class, importable as `from headless_terminal import HeadlessTerminal` |

The verifier instantiates the class, sends keystrokes (including control
sequences), runs commands, and checks that output, state, and interactive
program behavior match expectations.

## Recommended workflow

### 1. Survey the interface (≈ 5 min)

- Locate and read the `BaseTerminal` abstract class — it defines the methods
  you must implement. Look in the task directory or the container's Python
  path.
- Read `tasks/headless-terminal/instruction.md` for exact method signatures.
- Check if `pexpect` or `pty` is available; install as needed system-wide.

### 2. Choose the backend (≈ 5 min)

Two viable approaches:

**Option A: Python `pty` module (stdlib)**
- `os.openpty()` gives a master/slave pair.
- `subprocess.Popen` with `stdin=slave, stdout=slave, stderr=slave`.
- Manual `os.read()` and `os.write()` on the master FD.
- Gives full control but requires careful non-blocking I/O and buffering.

**Option B: `pexpect` (third-party)**
- Higher-level wrapper around PTY operations.
- `.send()`, `.sendcontrol()`, `.expect()` methods handle timing.
- Easier to get right, but adds a dependency.

Recommendation: use `pexpect` for reliability, but confirm the Docker image
has it or install it with `pip install pexpect`.

### 3. Implement the core class (≈ 20 min)

```python
# /app/headless_terminal.py
import pexpect

class HeadlessTerminal(BaseTerminal):
    def __init__(self):
        # Launch bash as an interactive login shell so it sources .bashrc
        self.process = pexpect.spawn(
            '/bin/bash',
            args=['--login', '-i'],
            encoding='utf-8',
            codec_errors='replace',
            timeout=30,
        )
        # Wait for the prompt to appear
        self.process.expect(r'\$|#|>')
        self._last_output = self.process.before + self.process.after

    def send_keys(self, keys: str) -> str:
        """Send a string of keystrokes (may include control chars) and return output."""
        self.process.send(keys)
        self.process.expect(r'\$|#|>')
        self._last_output = self.process.before + self.process.after
        return self._last_output

    def execute(self, command: str) -> str:
        """Run a command by sending it + Enter, return the output."""
        self.process.sendline(command)
        self.process.expect(r'\$|#|>')
        self._last_output = self.process.before + self.process.after
        return self._last_output

    def close(self):
        self.process.close()
```

Key implementation details:
- Launch bash with `--login -i` to source `~/.bashrc`, `~/.profile`, etc.
- Support control characters: `\x03` (Ctrl-C), `\x04` (Ctrl-D), `\x1a`
  (Ctrl-Z), etc. These should be written directly to the PTY as bytes.
- Preserve state between calls: the shell process stays alive, so
  `export FOO=bar` in one call persists for the next.
- Handle interactive programs: `vim`, `python`, `less` all work through
  the PTY.
- Set a reasonable default terminal type: `export TERM=xterm-256color`
  or set `TERM` in the spawn environment.

### 4. Handle edge cases (≈ 10 min)

- **Prompt detection:** Not all prompts end with `$` or `#`. Consider
  setting a known prompt (`export PS1='HEADLESS_PROMPT> '`) and
  expecting that.
- **Command output buffering:** Long-running commands may produce output
  in chunks. Use `expect()` with the known prompt as delimiter.
- **Non-UTF-8 output:** Set `codec_errors='replace'` to avoid crashes on
  binary output.
- **Ctrl-C handling:** Sending `\x03` should interrupt the currently
  running foreground process and return to the prompt.
- **Timeout on hung commands:** Set a `timeout` parameter and handle
  `pexpect.TIMEOUT` gracefully.

### 5. Test interactively (≈ 5 min)

```bash
cd /app
python3 -c "
from headless_terminal import HeadlessTerminal
t = HeadlessTerminal()
print(t.execute('echo hello'))
print(t.execute('export MYVAR=42 && echo \$MYVAR'))
print(t.execute('echo \$MYVAR'))  # Should still be 42
t.close()
"
```

## Verifier checklist (must all pass)

- [ ] `/app/headless_terminal.py` exists and is importable as
  `from headless_terminal import HeadlessTerminal`.
- [ ] `HeadlessTerminal` inherits from `BaseTerminal`.
- [ ] The terminal sources startup files (e.g., `~/.bashrc` is executed
  on shell startup).
- [ ] Modifier/control keys work: `\x03` sends SIGINT, `\x04` sends EOF,
  `\x1a` suspends.
- [ ] Shell state persists between send/execute calls (env vars, cwd,
  aliases).
- [ ] Interactive programs (e.g., `python3 -i`, `bc`) work through the
  headless terminal.
- [ ] The class handles edge cases gracefully (no hangs, no crashes on
  binary output).

## Common pitfalls

1. **Not sourcing startup files.** Launching bash without `--login` or
   `-i` skips `~/.bashrc`. The task explicitly requires startup file
   sourcing. Use `bash --login -i` or manually source `.bashrc` as the
   first command.
2. **Broken prompt detection.** If the shell's default prompt doesn't
   match your regex, `expect()` will time out on every command. Set a
   custom prompt (`PS1='__HEADLESS__$ '`) as the first action, then
   expect that exact string.
3. **State not persisting.** If you spawn a new process for each command
   instead of keeping a single long-lived shell, environment variables,
   working directory, and aliases are lost between calls. The class must
   hold a single persistent PTY.
4. **Control characters treated as literals.** Sending the string `"\x03"`
   as 4 ASCII characters instead of the single byte `0x03` will not
   trigger SIGINT. Use `sendcontrol('c')` in pexpect or write raw bytes
   to the PTY.
5. **Output interleaving.** If you issue a command before reading the
   output of the previous one, you'll get garbled results. Always drain
   the PTY buffer to the prompt before sending the next command.

## Quick sanity test (run after implementing)

```python
from headless_terminal import HeadlessTerminal

t = HeadlessTerminal()

# 1. Basic command
assert 'hello' in t.execute('echo hello')

# 2. State persistence
t.execute('MYTEST=xyz')
assert 'xyz' in t.execute('echo $MYTEST')

# 3. Ctrl-C
t.send_keys('\x03')  # Should not crash

# 4. Interactive program
t.execute('python3 -c "print(1+1)"')
assert '2' in t._last_output

t.close()
```

## Reference pointers

- `pexpect` documentation: https://pexpect.readthedocs.io/
- Python `pty` module: https://docs.python.org/3/library/pty.html
- The `BaseTerminal` abstract class in the task directory defines the exact
  interface you must implement — read it before writing any code.
- Inside the task container, the verifier at the task root is the ground
  truth for what is scored.
