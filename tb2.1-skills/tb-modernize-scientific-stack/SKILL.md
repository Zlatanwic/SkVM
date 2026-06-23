---
name: tb-modernize-scientific-stack
description: Migrate a legacy Python 2.7 climate analysis script to modern Python 3 syntax and libraries (pandas, pathlib, configparser), producing analyze_climate_modern.py and a requirements.txt or pyproject.toml dependency file. Use this skill whenever the task mentions Python 2 to 3 migration, climate analyzer, modernizing scientific code, pathlib.Path, pandas CSV reading with UTF-8, configparser, or generating requirements.txt. Also trigger for the alexgshaw/modernize-scientific-stack:20251031 Docker image or references to converting legacy scientific Python code to Python 3.
---

# tb-modernize-scientific-stack

Convert a broken Python 2.7 climate analysis script to a clean, modern
Python 3 equivalent using current libraries (pandas, pathlib, configparser),
and provide a properly version-pinned dependency file. This is a
Terminal-Bench 2.1 medium scientific-computing task; the full task lives at
`tasks/modernize-scientific-stack/`.

## When this skill triggers

Use it when the user is dropped into the `modernize-scientific-stack`
container and needs to produce `/app/analyze_climate_modern.py` and a
dependency file. Do **not** use it for general Python 2→3 migration
without the climate science context, or for tasks that modify the original
legacy code (which must remain untouched).

## Goal (one sentence)

Rewrite the legacy Python 2.7 climate analyzer into a Python 3 script that
reads `climate_data.csv` with pandas, computes per-station mean temperatures,
and outputs `"Station {id} mean temperature: {value:.1f}°C"` lines.

## Required outputs

| File | Purpose |
|---|---|
| `/app/analyze_climate_modern.py` | Modern Python 3 script that processes climate data from CSV and prints per-station mean temperatures. Must not import or use Python 2 syntax. |
| `/app/requirements.txt` or `/app/pyproject.toml` | Dependency file with version constraints for numpy, pandas, and at least one of matplotlib or scipy. |

## Recommended workflow

### 1. Study the legacy code and data (≈ 5 min)

Read the original (DO NOT MODIFY):
```bash
cat /app/climate_analyzer/analyze_climate.py
```

Identify:
- What does it import? (`csv` module? old libraries?)
- What Python 2 constructs does it use? (`print` statements without parens,
  `xrange`, `dict.iteritems()`, `unicode` strings, `basestring`, etc.)
- How does it read the CSV? (`csv.reader`, `pandas`?)
- What file paths does it reference?

Inspect the input data:
```bash
head -5 /app/climate_analyzer/sample_data/climate_data.csv
```

Note: the CSV uses UTF-8 encoding. Columns likely include station ID,
temperature readings, and dates.

Inspect the config:
```bash
cat /app/climate_analyzer/config.ini
```

### 2. Plan the migration (≈ 3 min)

Common Python 2→3 changes needed:

| Python 2 | Python 3 |
|---|---|
| `print "hello"` | `print("hello")` |
| `xrange(N)` | `range(N)` |
| `dict.iteritems()` | `dict.items()` |
| `unicode(s)` | `str(s)` |
| `basestring` | `str` |
| `except Exception, e:` | `except Exception as e:` |
| `open(file)` | Use `pathlib.Path` or `open(file, encoding='utf-8')` |
| `os.path.join()` | `pathlib.Path` |
| `csv.reader()` | `pandas.read_csv()` |
| `ConfigParser` | `configparser.ConfigParser()` |

### 3. Write the modern script (≈ 10 min)

```python
# /app/analyze_climate_modern.py
import pandas as pd
import configparser
from pathlib import Path

def main():
    # File paths using pathlib
    data_dir = Path("/app/climate_analyzer/sample_data")
    config_path = Path("/app/climate_analyzer/config.ini")
    csv_path = data_dir / "climate_data.csv"

    # Read config (if needed)
    config = configparser.ConfigParser()
    config.read(config_path, encoding="utf-8")

    # Read CSV with pandas and UTF-8
    df = pd.read_csv(csv_path, encoding="utf-8")

    # Process each station (101 and 102)
    for station_id in [101, 102]:
        station_data = df[df["station"] == station_id]
        mean_temp = station_data["temperature"].mean()
        print(f"Station {station_id} mean temperature: {mean_temp:.1f}°C")

if __name__ == "__main__":
    main()
```

Adapt the column names (`station`, `temperature`) to match the actual CSV
schema. The task specifically requires stations 101 and 102.

### 4. Write the dependency file (≈ 5 min)

Option A — `requirements.txt`:
```
numpy>=1.24,<2.0
pandas>=2.0,<3.0
matplotlib>=3.7,<4.0
```

Option B — `pyproject.toml`:
```toml
[project]
name = "climate-analyzer-modern"
version = "1.0.0"
requires-python = ">=3.9"
dependencies = [
    "numpy>=1.24",
    "pandas>=2.0",
    "matplotlib>=3.7",
]
```

Key requirements:
- Must include numpy and pandas.
- Must include at least one of matplotlib or scipy.
- Must use version constraints (`>=`, `==`, or `~=`).

### 5. Test the script (≈ 5 min)

```bash
cd /app && python3 analyze_climate_modern.py
```

Expected output (approximate):
```
Station 101 mean temperature: XX.X°C
Station 102 mean temperature: YY.Y°C
```

Verify it matches the expected output from the legacy code's logic. If
numbers differ, check:
- UTF-8 encoding (default in pandas vs. the legacy script).
- Column name mappings.
- Filtering logic (is it `station_id == 101` or some other column?).

## Verifier checklist (must all pass)

- [ ] `/app/analyze_climate_modern.py` exists and runs with Python 3.
- [ ] Script uses `pandas.read_csv()` with `encoding="utf-8"`.
- [ ] Script uses `pathlib.Path` for file paths.
- [ ] Script reads `config.ini` using `configparser` if needed.
- [ ] Output matches format: `"Station {id} mean temperature: {value:.1f}°C"`.
- [ ] Both stations (101 and 102) are processed.
- [ ] `/app/requirements.txt` or `/app/pyproject.toml` exists.
- [ ] Dependency file includes numpy, pandas, and matplotlib/scipy with
      version constraints.
- [ ] Legacy code at `/app/climate_analyzer/analyze_climate.py` is NOT modified.

## Common pitfalls

1. **Modifying the original legacy script.** The task explicitly states:
   "DO NOT MODIFY" the original. The modern version goes in a new file at
   `/app/analyze_climate_modern.py`. The verifier checks the legacy file's
   integrity.
2. **Wrong column names.** The legacy script may use different column names
   than expected (e.g., `station_id` vs `station`, `temp` vs `temperature`).
   Always inspect the actual CSV header and the legacy script's column
   references before writing the new code.
3. **Missing UTF-8 encoding.** The task requires `pd.read_csv()` with
   `encoding="utf-8"`. Default system encoding differs across containers;
   omitting the explicit encoding can produce garbled data or errors with
   Scandinavian/Nordic characters in the dataset.
4. **Floating-point output mismatch.** The output format requires `.1f`
   (one decimal place). If you use `.2f`, `.0f`, or no formatting, the
   verifier's string comparison may fail.
5. **Missing or invalid dependency file.** The task requires either
   `requirements.txt` or `pyproject.toml` with version constraints. A file
   listing packages without `>=`, `==`, or `~=` constraints does not meet
   the spec.

## Reference pointers

- Python 3 migration guide: https://docs.python.org/3/howto/pyporting.html
- `pandas.read_csv`: https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html
- `pathlib`: https://docs.python.org/3/library/pathlib.html
- `configparser`: https://docs.python.org/3/library/configparser.html
- Inside the container: the legacy code at
  `/app/climate_analyzer/analyze_climate.py` tells you exactly what the
  original does. Mirror its logic faithfully in modern syntax.
