---
name: tb-filter-js-from-html
description: Build a Python HTML sanitizer that removes all JavaScript while preserving legitimate HTML structure. Use this skill whenever the task involves creating an XSS filter, stripping `<script>` tags and event handlers from HTML files, writing `/app/filter.py` that takes an HTML file argument and modifies it in-place, preserving tables/headers/formatting/attributes while removing dangerous content, or working inside the `filter-js-from-html` Docker container. Also trigger when the user needs to implement a JS-blocking content filter, sanitize HTML for safe rendering, or eliminate inline event handlers and javascript: URIs without breaking the page layout.
---

# tb-filter-js-from-html

Build `/app/filter.py` — a robust HTML sanitizer that removes all JavaScript
from HTML files in-place while preserving legitimate HTML structure, formatting,
tables, headers, and non-dangerous attributes. This is one of the
Terminal-Bench 2.1 task skills; the full task lives at
`tasks/filter-js-from-html/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `filter-js-from-html` Docker
container and needs to create a Python script that strips JavaScript from HTML
files. Do **not** use it for general HTML parsing or web scraping — this is
specifically about XSS prevention through surgical removal of executable code
paths (script tags, inline handlers, javascript: URIs) while leaving
everything else untouched.

## Goal (one sentence)

Remove all JavaScript execution vectors from an HTML file while preserving
all non-executable content, structure, and formatting as faithfully as
possible.

## Required outputs

| File | Purpose |
|---|---|
| `/app/filter.py` | Python script that accepts an HTML file path as `argv[1]` and modifies the file in-place to remove all JavaScript. |

The verifier tests `/app/filter.py` against a suite of HTML files containing
various JS injection techniques and checks that: (1) all JS is removed, (2)
legitimate HTML is preserved, (3) formatting is not altered beyond what HTML
parsing normalizes.

## Recommended workflow

### 1. Understand the attack surface (≈ 5 min)

JavaScript can appear in HTML through multiple vectors. Your filter must
block all of them:

- `<script>...</script>` and `<script src="...">` tags
- Inline event handlers: `onclick`, `onload`, `onerror`, `onmouseover`, etc.
  (there are dozens — about 80+ standard event handler attributes)
- `javascript:` URIs in `href`, `src`, `action`, `formaction`, and other
  URI-accepting attributes
- `<a href="javascript:alert(1)">` links
- CSS expressions (legacy IE: `style="width: expression(...)"`)
- `<meta http-equiv="refresh">` with javascript: URLs
- `<object>`, `<embed>`, `<applet>` tags that can host active content
- SVG `<script>`, `<use>`, and event handlers
- Data URIs that contain JavaScript

### 2. Choose a parsing strategy (≈ 3 min)

Two main approaches:

**Option A: BeautifulSoup + allowlist** (recommended for moderate difficulty)
- Parse HTML with `BeautifulSoup(markup, "html.parser")` or `"lxml"`.
- Walk the tree, removing disallowed tags and attributes.
- Serialize back to string.

**Option B: Regex-based stripping** (fragile, not recommended)
- Hard to handle all edge cases (nested tags, obfuscation, mixed case,
  attribute quoting variations).
- The verifier likely tests edge cases that break regex approaches.

**Option C: html5lib + custom sanitizer** (most robust)
- `html5lib` parses HTML the way browsers do.
- Build an allowlist of safe tags and attributes.

### 3. Implement the filter (≈ 25 min)

```python
#!/usr/bin/env python3
""" /app/filter.py — Remove JavaScript from HTML files. """

import sys
from bs4 import BeautifulSoup

# Allowlisted tags: structural HTML elements, no scripting containers
ALLOWED_TAGS = {
    'html', 'head', 'title', 'body', 'meta', 'link',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'caption', 'colgroup', 'col',
    'div', 'span', 'section', 'article', 'nav', 'aside',
    'header', 'footer', 'main',
    'a', 'img', 'figure', 'figcaption',
    'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
    'code', 'kbd', 'samp', 'var',
    'abbr', 'address', 'cite', 'q', 'small', 'time',
    'form', 'input', 'label', 'select', 'option', 'textarea',
    'button', 'fieldset', 'legend',
    'style',  # CSS is OK, but check for expression()
}

# Event handler attributes (exhaustive list)
EVENT_HANDLERS = {
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'onkeypress', 'onkeydown', 'onkeyup',
    'onload', 'onunload', 'onerror', 'onscroll', 'onresize',
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
    'onselect', 'oninput', 'oninvalid', 'onformchange', 'onforminput',
    'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover',
    'ondragstart', 'ondrop', 'oncopy', 'oncut', 'onpaste',
    'onabort', 'oncanplay', 'oncanplaythrough', 'ondurationchange',
    'onemptied', 'onended', 'onloadeddata', 'onloadedmetadata',
    'onloadstart', 'onpause', 'onplay', 'onplaying', 'onprogress',
    'onratechange', 'onseeked', 'onseeking', 'onstalled', 'onsuspend',
    'ontimeupdate', 'onvolumechange', 'onwaiting',
    'onanimationend', 'onanimationiteration', 'onanimationstart',
    'ontransitionend',
    'oncontextmenu', 'onwheel', 'ontoggle',
}

def sanitize_html(filepath: str) -> None:
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')

    # Remove <script>, <noscript>, <object>, <embed>, <applet>
    for tag_name in ['script', 'noscript', 'object', 'embed', 'applet']:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    # Remove event handlers and javascript: URIs from all tags
    for tag in soup.find_all(True):
        # Remove event handler attributes
        for attr in list(tag.attrs):
            if attr.lower() in EVENT_HANDLERS:
                del tag[attr]
            elif isinstance(tag[attr], str) and 'javascript:' in tag[attr].lower():
                # Strip javascript: URIs, replace with '#'
                tag[attr] = '#'
            elif attr.lower() == 'style':
                # Remove CSS expression()
                if 'expression(' in str(tag[attr]).lower():
                    del tag[attr]

    # Write back in-place
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(str(soup))

if __name__ == '__main__':
    sanitize_html(sys.argv[1])
```

### 4. Handle edge cases (≈ 10 min)

- **Entity-encoded JS**: `<a href="&#106;avascript:alert(1)">` — the browser
  decodes entities before evaluating URIs. You must decode or detect the
  pattern `javascript:` after entity resolution.
- **Null bytes**: `java\0script:` bypasses naive string matching.
- **Mixed case**: `JavaScript:`, `JaVaScRiPt:` — normalize to lowercase
  before checking.
- **Whitespace**: some browsers tolerate `java  script:` — normalize.
- **Nested scripts**: `<scr<script>ipt>` — your parser must handle this.
- **SVG elements**: `<svg><script>alert(1)</script></svg>` — SVG can contain
  its own `<script>` tags.

### 5. Test with known XSS vectors (≈ 5 min)

```bash
# Create test files with various XSS payloads
echo '<html><body><p>Hello</p><script>alert(1)</script></body></html>' > /tmp/test1.html
python3 /app/filter.py /tmp/test1.html
cat /tmp/test1.html  # Should not contain <script>

echo '<a href="javascript:alert(1)" onclick="bad()">click</a>' > /tmp/test2.html
python3 /app/filter.py /tmp/test2.html
cat /tmp/test2.html  # href should be '#', onclick removed
```

## Verifier checklist (must all pass)

- [ ] `/app/filter.py` exists and runs without import errors.
- [ ] `filter.py` accepts a single command-line argument (the HTML file path).
- [ ] All `<script>` tags and their contents are removed.
- [ ] All inline event handlers (`on*` attributes) are stripped.
- [ ] All `javascript:` URIs are neutralized.
- [ ] Legitimate HTML structure (headings, paragraphs, lists, tables) is preserved.
- [ ] Non-dangerous attributes (`id`, `class`, `href` to safe URLs, `src` on
      `<img>`) survive.
- [ ] Formatting changes are limited to what the HTML parser normalizes
      (whitespace, quote style).

## Common pitfalls

1. **Incomplete event handler list.** There are ~80+ standard `on*` attributes
   plus proprietary ones. Using a blocklist approach (removing known handlers)
   leaves you vulnerable to handlers you forgot. Use a comprehensive list or
   an allowlist of safe attributes instead.
2. **BeautifulSoup normalizes HTML on output.** By default, `str(soup)` or
   `soup.prettify()` may add/remove whitespace, change quote styles, reorder
   attributes, or add `<html><head><body>` wrappers. This may cause the
   verifier to fail the "do not alter formatting" requirement. Use the
   original formatter or a non-normalizing serializer if available.
3. **Forgetting SVG and MathML namespaces.** Modern HTML supports embedded
   SVG, which has its own `<script>` tag and event handlers. If you only
   strip HTML-namespaced elements, SVG-based XSS slips through.
4. **Regenerating `<html>`, `<head>`, `<body>` implicitly.** Some parsers
   auto-insert structural elements. If the input was a fragment, your output
   should remain a fragment, not a full document.
5. **Entity-encoding bypass.** The string `&#x6A;avascript:` is decoded by
   the browser to `javascript:` before URI evaluation. Simple substring
   matching on the raw source misses this.

## Quick sanity test (run after writing)

```python
# In the Docker container
echo '<div onclick="xss">Hello<a href="javascript:foo">link</a><script>bad()</script></div>' > /tmp/test.html
python3 /app/filter.py /tmp/test.html
cat /tmp/test.html
# Expected: <div>Hello<a href="#">link</a></div>
```

## Reference pointers

- OWASP XSS Filter Evasion Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html
- HTML5 Security Cheat Sheet — lists all event handlers, javascript: contexts,
  and SVG attack vectors.
- BeautifulSoup documentation: `https://www.crummy.com/software/BeautifulSoup/bs4/doc/`
- `html5lib` is a browser-grade parser: `pip install html5lib` and use
  `BeautifulSoup(markup, "html5lib")` for the most robust parsing.
- The verifier's test suite is the ultimate specification — run it after
  writing to find missed cases.
