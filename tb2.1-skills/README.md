# Terminal-Bench 2.1 — Task Skills (89 skills)

Reusable Claude Skills distilled from all 89 Terminal-Bench 2.1 tasks. Each skill captures the workflow, required artifacts, verifier contract, and common pitfalls for one task, so an agent dropped into the corresponding Docker container can solve it without re-deriving the approach from scratch.

## By Category

### Scientific Computing & Statistics
| Skill | Task | Difficulty |
|---|---|---|
| `tb-adaptive-rejection-sampler` | ARS algorithm in R (Gilks & Wild 1992) | medium |
| `tb-bn-fit-modify` | Bayesian Network causal inference (bnlearn) | hard |
| `tb-dna-assembly` | Golden Gate primer design | hard |
| `tb-dna-insert` | Q5 site-directed mutagenesis primers | medium |
| `tb-largest-eigenval` | Largest eigenvalue computation | medium |
| `tb-mcmc-sampling-stan` | MCMC sampling with Stan | hard |
| `tb-modernize-scientific-stack` | Modernize legacy scientific software stack | medium |
| `tb-protein-assembly` | Protein assembly from PDB/FPbase | hard |
| `tb-raman-fitting` | Lorentzian peak fitting for graphene Raman | medium |
| `tb-rstan-to-pystan` | RStan to PyStan conversion | medium |
| `tb-sam-cell-seg` | SAM-based cell segmentation | medium |
| `tb-tune-mjcf` | MuJoCo MJCF tuning | medium |

### Machine Learning & AI
| Skill | Task | Difficulty |
|---|---|---|
| `tb-caffe-cifar-10` | Caffe CNN on CIFAR-10, 500 iters CPU | medium |
| `tb-count-dataset-tokens` | HuggingFace dataset + Qwen2.5 tokenizer | medium |
| `tb-distribution-search` | Dual KL divergence, 150K-vocab distribution | medium |
| `tb-gpt2-codegolf` | GPT-2 inference code golf (5000 bytes) | hard |
| `tb-hf-model-inference` | HuggingFace model inference | medium |
| `tb-llm-inference-batching-scheduler` | LLM batching scheduler design | hard |
| `tb-model-extraction-relu-logits` | Model extraction via ReLU logits | hard |
| `tb-mteb-leaderboard` | MTEB leaderboard computing | medium |
| `tb-mteb-retrieve` | MTEB retrieval task | medium |
| `tb-pytorch-model-cli` | C CLI for MNIST from JSON weights | medium |
| `tb-pytorch-model-recovery` | Reconstruct Transformer from state dict | hard |
| `tb-torch-pipeline-parallelism` | Pipeline parallelism in PyTorch | hard |
| `tb-torch-tensor-parallelism` | Tensor parallelism in PyTorch | hard |
| `tb-train-fasttext` | FastText training | medium |

### Software Engineering & Build Systems
| Skill | Task | Difficulty |
|---|---|---|
| `tb-build-cython-ext` | Build pyknotid Cython + NumPy 2.x | medium |
| `tb-build-pmars` | Build pMARS Core War (Debian, no X11) | medium |
| `tb-build-pov-ray` | Build POV-Ray 2.2 legacy raytracer | medium |
| `tb-cancel-async-tasks` | Async task concurrency limiter | medium |
| `tb-compile-compcert` | Build CompCert 3.13.1 verified C compiler | hard |
| `tb-headless-terminal` | Headless terminal emulation | medium |
| `tb-kv-store-grpc` | gRPC key-value store | medium |
| `tb-polyglot-c-py` | C/Python polyglot program | medium |
| `tb-polyglot-rust-c` | Rust/C polyglot program | hard |
| `tb-pypi-server` | Local PyPI server on port 8080 | medium |
| `tb-write-compressor` | File write compression | medium |

### Security & Cryptanalysis
| Skill | Task | Difficulty |
|---|---|---|
| `tb-break-filter-js-from-html` | XSS filter bypass (JS from HTML) | medium |
| `tb-crack-7z-hash` | 7z2john + John the Ripper cracking | medium |
| `tb-feal-differential-cryptanalysis` | FEAL differential cryptanalysis | hard |
| `tb-feal-linear-cryptanalysis` | FEAL linear cryptanalysis | hard |
| `tb-filter-js-from-html` | Filter JavaScript from HTML | medium |
| `tb-fix-code-vulnerability` | Code vulnerability patching | medium |
| `tb-openssl-selfsigned-cert` | OpenSSL self-signed certificate | medium |
| `tb-password-recovery` | Password recovery (forensic) | hard |
| `tb-vulnerable-secret` | Secret extraction from vulnerable system | medium |

### System Administration & DevOps
| Skill | Task | Difficulty |
|---|---|---|
| `tb-configure-git-webserver` | Git post-receive hook + nginx :8080 | hard |
| `tb-install-windows-3.11` | Windows 3.11 installation | hard |
| `tb-mailman` | Mailman mailing list setup | medium |
| `tb-nginx-request-logging` | NGINX request logging configuration | medium |
| `tb-qemu-alpine-ssh` | Boot Alpine VM with SSH :2222 | medium |
| `tb-qemu-startup` | Boot Alpine VM with telnet :6665 | medium |

### Data Processing & File Operations
| Skill | Task | Difficulty |
|---|---|---|
| `tb-code-from-image` | OCR pseudocode from image | medium |
| `tb-db-wal-recovery` | XOR-decrypt SQLite WAL, recover records | medium |
| `tb-extract-elf` | ELF binary parsing + Node.js | medium |
| `tb-extract-moves-from-video` | Extract chess moves from video | medium |
| `tb-financial-document-processor` | Financial document processing | medium |
| `tb-gcode-to-text` | G-code to text conversion | medium |
| `tb-large-scale-text-editing` | Large-scale text editing | medium |
| `tb-log-summary-date-ranges` | Log date range summarization | medium |
| `tb-multi-source-data-merger` | Multi-source data merging | medium |
| `tb-reshard-c4-data` | C4 dataset resharding | medium |
| `tb-video-processing` | Video processing pipeline | medium |

### Database & Query
| Skill | Task | Difficulty |
|---|---|---|
| `tb-query-optimize` | SQL query optimization (OEWN SQLite) | medium |
| `tb-sparql-university` | SPARQL university queries | medium |
| `tb-sqlite-db-truncate` | SQLite database truncation | medium |
| `tb-sqlite-with-gcov` | SQLite with gcov coverage | medium |

### Mathematics, Logic & Proof
| Skill | Task | Difficulty |
|---|---|---|
| `tb-circuit-fibsqrt` | Logic gate circuit fib(isqrt(N)) | hard |
| `tb-constraints-scheduling` | ICS parsing, 3-person constraint satisfaction | medium |
| `tb-merge-diff-arc-agi-task` | Merge/diff ARC-AGI task | medium |
| `tb-portfolio-optimization` | Portfolio optimization | medium |
| `tb-prove-plus-comm` | Coq proof of addition commutativity | medium |
| `tb-regex-chess` | Chess move generator via regex on FEN | medium |
| `tb-regex-log` | Regex for dates in log lines with IPv4 | medium |

### Games & Simulation
| Skill | Task | Difficulty |
|---|---|---|
| `tb-chess-best-move` | Extract chess position from image, best move | medium |
| `tb-make-doom-for-mips` | Build DOOM for MIPS | hard |
| `tb-make-mips-interpreter` | MIPS interpreter in C | hard |
| `tb-path-tracing` | Path tracing renderer (forward) | hard |
| `tb-path-tracing-reverse` | Path tracing reverse-engineering | hard |
| `tb-winning-avg-corewars` | Winning average Core Wars warrior | medium |

### Debugging & Recovery
| Skill | Task | Difficulty |
|---|---|---|
| `tb-custom-memory-heap-crash` | C++ static init order fiasco | medium |
| `tb-fix-git` | Git repository repair | medium |
| `tb-fix-ocaml-gc` | OCaml GC fix | hard |
| `tb-git-leak-recovery` | Git leak data recovery | medium |
| `tb-git-multibranch` | Git multi-branch management | medium |
| `tb-sanitize-git-repo` | Git repository sanitization | medium |

### Legacy & Languages
| Skill | Task | Difficulty |
|---|---|---|
| `tb-cobol-modernization` | COBOL → Python modernization | medium |
| `tb-overfull-hbox` | LaTeX overfull hbox fix via synonyms | easy |
| `tb-schemelike-metacircular-eval` | Scheme metacircular evaluator | medium |

---

## When to use a skill in this directory

The description field in each `SKILL.md` is intentionally pushy — if the
user's prompt contains any of the listed task signals (artifact
filenames, Docker image names, variable names, paper references, library
names), the skill should fire. The full task source — including the
`README.md`, `instruction.md`, `task.toml`, `tests/`, and `solution/`
— lives at `tasks/<task-name>/` one directory up and should be re-read
inside the container for the latest verifier contract.

## How a skill is structured

Each `SKILL.md` contains:

1. **YAML frontmatter** — `name` and a `description` that doubles as trigger criteria.
2. **When this skill triggers** — scope boundaries and trigger signals.
3. **Goal (one sentence)** — the single deliverable in plain language.
4. **Required outputs** — the exact artifact filenames and formats the verifier expects.
5. **Recommended workflow** — time-boxed steps the agent can follow without further planning.
6. **Verifier checklist** — the binary signals to confirm before claiming success.
7. **Common pitfalls** — failure modes and their fixes.
8. **Reference pointers** — docs, tools, papers, and key file paths.

## Quick Stats

- **Total skills**: 89
- **Hard**: 21 | **Medium**: 67 | **Easy**: 1
- **Generated**: 2026-06-22
- **Namespaced**: `tb-` prefix for all skills
