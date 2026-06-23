---
name: tb-break-filter-js-from-html
description: Bypass a BeautifulSoup-based HTML/JavaScript sanitization filter and produce an /app/out.html that fires a JavaScript alert() automatically after being processed by /app/filter.py. Use this skill whenever the task mentions XSS filter bypass, BeautifulSoup sanitization, the break-filter-js-from-html Docker image, the filter that removes <script>/<frame>/<iframe>/<object>/<embed> tags plus on* event handlers, /app/out.html, /app/filter.py, or asks the agent to craft an HTML payload that survives sanitization yet executes JS without user interaction. The skill covers: parser-differential analysis (BS4 vs browser), surviving attribute and tag sets, self-firing vectors (no click required), and the Selenium-based verifier loop.
---

# tb-break-filter-js-from-html

Produce an HTML file that, after being processed by the in-container
sanitization filter, still triggers `alert()` automatically when opened
in a headless Chromium. This is one of three Terminal-Bench 2.1 task
skills; the full task lives at
`tasks/break-filter-js-from-html/` in the same repo as this skill.

## When this skill triggers

The user is inside the `break-filter-js-from-html` Docker container
(`python:3.13-slim-bookworm`, with BeautifulSoup4, Selenium, Chromium,
and chromedriver pre-installed). The filter at `/app/filter.py` is the
opponent; the artifact at `/app/out.html` is the deliverable. Do not use
this skill for generic "build a webpage" or "write a BeautifulSoup
scraper" tasks — the framing is **adversarial filter bypass**, and the
mental model is "BS4 vs browser parser differential."

## Goal (one sentence)

Create `/app/out.html` that survives `python /app/filter.py /app/out.html`
in-place, then opens cleanly in headless Chromium and auto-fires
`alert()` within 5 seconds — no clicks, no hovers, no user input.

## How the filter works (read this first)

Open `/app/filter.py` and read every line. The README summarizes the
sanitization as:

- **Tags removed**: `<script>`, `<frame>`, `<iframe>`, `<object>`, `<embed>`.
- **Attributes stripped**: any attribute starting with `on` (`onclick`,
  `onload`, `onerror`, `onfocus`, `onmouseover`, …).
- **Processing**: parsed through BeautifulSoup's `html.parser` (or
  `lxml`) and re-serialized.

The verifier (`tests/test.sh` calling `test_outputs.py`) does this:

1. Check `/app/out.html` exists.
2. Copy the file to a temp location and run the filter in-place on the
   copy.
3. Open the filtered file in headless Chromium via Selenium.
4. Wait up to 5 seconds for an `alert()` to appear.
5. Pass only if the alert fires.

## Recommended workflow

### 1. Read the actual filter, not just the README (≈ 2 min)

```bash
cat /app/filter.py
```

The exact parser choice (`html.parser` vs `lxml` vs `html5lib`) and the
exact tag/attribute removal logic determine which parser-differential
techniques work. If the filter uses `html.parser` and you try an
`html5lib`-only technique, you'll fail silently. Always mirror the
filter's parser behavior when prototyping.

### 2. Set up a fast local loop (≈ 5 min)

Don't iterate against the full verifier (slow). Build a micro-harness:

```python
# /tmp/iterate.py — local, < 2 seconds per loop
import subprocess, sys
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support.expected_conditions import alert_is_present

PAYLOAD = Path("/tmp/payload.html").read_text()
Path("/tmp/payload_filtered.html").write_text(PAYLOAD)
subprocess.run(["python", "/app/filter.py", "/tmp/payload_filtered.html"], check=True)

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
driver = webdriver.Chrome(options=opts)
try:
    driver.set_page_load_timeout(5)
    driver.get("file:///tmp/payload_filtered.html")
    WebDriverWait(driver, 5).until(alert_is_present)
    print("FIRING: payload works")
except Exception as e:
    print("FAIL:", e)
finally:
    driver.quit()
```

You should be able to run this in a tight loop: edit payload, rerun,
observe pass/fail.

### 3. Pick a bypass family

There are four broad families, in rough order of robustness:

1. **Parser-differential / HTML smuggling.** Craft markup that
   BeautifulSoup's parser "fixes" or removes but the browser's parser
   still interprets as a script-firing tag. Classic examples revolve
   around `<script>` re-tokenization: nested tags that decode into a
   `<script>` after BS4's serialization, malformed close tags, or
   attribute tricks that survive BS4's attribute-stripping pass.

2. **Non-on* attribute vectors.** Some event-adjacent attributes bypass
   the `startswith("on")` filter — e.g., the legacy `isindex` element,
   `<form action=javascript:...>` (auto-submit patterns), or
   pseudo-protocol URLs in attributes that aren't `on*`. Test each one
   you remember against the filter; if the attribute stays, then check
   whether the browser fires JS without interaction.

3. **Self-firing meta / navigation tags.** `<meta http-equiv="refresh"
   content="0;url=javascript:alert(1)">` and similar HTTP-equiv
   redirect-to-javascript patterns are well-known and frequently
   unfiltered. They don't require a click and fire on page load.

4. **SVG / MathML exotic elements.** `<svg>` and `<math>` introduce
   elements (e.g., `<set>`, `<animate>`, `<animateMotion>`,
   `<mtext>`, `<mglyph>`) that have JS-triggering attributes distinct
   from the standard `on*` family. These often survive filters that
   only strip "obvious" event attributes.

5. **JavaScript URL in a non-on* attribute.** `<iframe>` and `<object>`
   are filtered, but other elements (`<a href=…>`, `<area href=…>`,
   `<form action=…>`, `<base href=…>`, `<link href=…>`, `<input
   formaction=…>`) accept `javascript:` URLs. The trick is finding one
   that auto-fires. `<form action="javascript:…" ><button
   type=submit autofocus>` is a known auto-submit pattern; the
   `autofocus` attribute triggers a click on the form button without
   user interaction.

### 4. Verify the payload works against the *actual* filter (≈ 2 min)

Replace your micro-harness with the real verifier:

```bash
cd /app && python tests/test_outputs.py
```

Expect a single binary outcome: PASS or FAIL with a brief reason.

### 5. If it fails, instrument (≈ 3 min)

When a payload doesn't fire, the failure mode is usually one of:

- **Browser blocks the file:// URL.** Headless Chromium may refuse
  `file://` for some content types; serve over `http://localhost:port`
  via `python -m http.server` if needed.
- **Filter strips the element by tag name, not by tag behavior.** A
  payload that depends on `<svg>` may break if the filter is updated
  to also strip SVG. Always read `/app/filter.py` again after a fail.
- **Alert dialog isn't caught by Selenium in time.** 5 seconds is the
  verifier's hard cap; longer pages or delayed JS may need a `setTimeout`
  pre-trigger.
- **Payload depends on a specific Chromium version.** Some exotic
  techniques (e.g., certain SVG `<animate>` behavior) regress across
  Chromium releases. The container pins a specific Chromium build, so
  check `chromium --version` and the `Dockerfile` if available.

## Verifier checklist (must all pass)

- [ ] `/app/out.html` exists.
- [ ] After `python /app/filter.py /app/out.html`, the file is smaller
      or restructured but **still valid HTML**.
- [ ] Headless Chromium opens the filtered file without error.
- [ ] An `alert()` dialog appears within 5 seconds.
- [ ] No user interaction (click, hover, keypress) is required to fire
      the alert.

## Common pitfalls

1. **Adding `onclick` and friends.** The filter strips every attribute
   that starts with `on`. Putting `onclick=alert(1)` in your payload
   guarantees failure.
2. **Forgetting the auto-fire requirement.** `<a href=javascript:...>`Click
   me`</a>` won't pass the verifier — the alert only fires on click.
   The skill description explicitly requires "no interaction," and the
   task instruction echoes it.
3. **Wrapping a `<script>` inside an allowed tag.** If the inner
   `<script>` is the *only* thing that fires, the filter still removes
   it. The whole tree of permitted tags cannot contain a `<script>`.
4. **Relying on CSS.** CSS is a presentation language, not a JS engine.
   `expression()` is dead, `url()` doesn't run JS in any modern
   Chromium.
5. **Trusting the README over the code.** The README is a summary; the
   filter is the contract. Read `/app/filter.py` first, every time.

## What "the answer" looks like in spirit

The accepted solution is a short HTML file (usually under 30 lines) that
exploits exactly one parser-differential or non-on* attribute trick. The
canonical patterns from published solutions of this task family use
either:

- A `<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`
  pattern, or
- A self-submitting `<form action="javascript:…">` with `autofocus` on
  a button, or
- An SVG/MathML element whose non-`on*` attribute triggers JS on
  load.

You should expect to try several payloads before landing one — the
filter is intentionally non-trivial, and the verifier gives you a clear
binary signal to iterate on.

## Quick sanity test (run after writing)

```bash
python /app/filter.py /app/out.html
python tests/test_outputs.py
# expect: PASS
```

## Reference pointers

- HTML parsing differential write-ups: the
  [html5sec.org](https://html5sec.org/) and
  [OWASP XSS Filter Evasion](https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html)
  cheat sheets catalog the bypass families.
- BeautifulSoup parser modes: `html.parser` (stdlib, lenient), `lxml`
  (strict XML-ish), `html5lib` (closest to browser). Which one the
  filter uses dictates which parser differentials are exploitable.
- Inside the task container, `/app/filter.py` and
  `tests/test_outputs.py` are the ground truth.
