# TB 2.1 Skill 分诊 — bare-agent 可评估子集

> 目的：从 89 个 tb2.1-skills 中筛出 bare-agent（WSL 宿主机，非 Docker 容器）能干净评估的「自包含型」任务，
> 用于四条件 benchmark（no-skill / original / aot / jit）。
> 生成日期：2026-06-23

## 分诊标准

| 判定 | 信号 |
|---|---|
| ✅ 可评估（self-contained） | 输出为文本/JSON/npy/sql/.py 等文件；验证逻辑为纯 Python / stdlib / numpy / scipy / sqlite / git / openssl，可在 WSL 宿主机运行 |
| ❌ 需容器（needs-container） | 需要编译（C/.so/.pyd/cython/make）、启动 VM（qemu）、跑服务（nginx/grpc/pypi/mailman）、专用工具链（caffe/stan/coq/ocaml/R/john/7z）、重型 ML（torch/fasttext/SAM/MTEB）、OCR、或联网拉取（PDB/FPbase） |

> 注：`/app/` 硬编码路径**不是**排除项 —— optimizer 已证明能把它改写为 workdir 相对路径（这正是 tb-regex-log 0→1.0 的机制）。

## 锁定选择（20 个新 + 3 个已完成 = 23）

### 已完成（3，已有数据）
| Skill | baseline | 结果 |
|---|---|---|
| tb-regex-log | 0.000 | **1.000**（Δ+1.0，路径改写） |
| tb-sqlite-db-truncate | 1.000 | 收敛跳过 |
| tb-log-summary-date-ranges | 1.000 | 收敛跳过 |

### 待跑（20，高置信度自包含）
| # | Skill | 输出 | 验证栈 |
|---|---|---|---|
| 1 | tb-regex-chess | re.json | regex / python |
| 2 | tb-filter-js-from-html | filter.py | html 解析 / python |
| 3 | tb-break-filter-js-from-html | out.html | python（依赖 filter.py） |
| 4 | tb-gcode-to-text | out.txt | 纯解析 |
| 5 | tb-constraints-scheduling | *.ics | ics 解析 / python |
| 6 | tb-query-optimize | sol.sql | sqlite stdlib |
| 7 | tb-db-wal-recovery | recovered.json | xor + sqlite |
| 8 | tb-distribution-search | dist.npy | numpy |
| 9 | tb-cancel-async-tasks | run.py | asyncio import |
| 10 | tb-circuit-fibsqrt | gates.txt | 逻辑门模拟 |
| 11 | tb-feal-linear-cryptanalysis | *.txt | 纯密码学 |
| 12 | tb-feal-differential-cryptanalysis | attack.py | 纯密码学 |
| 13 | tb-multi-source-data-merger | *.parquet/json | pandas/pyarrow |
| 14 | tb-reshard-c4-data | compress.py/decompress.py | 纯文件操作 |
| 15 | tb-raman-fitting | results.json | numpy/scipy 拟合 |
| 16 | tb-llm-inference-batching-scheduler | *.jsonl | 纯打包逻辑 |
| 17 | tb-fix-code-vulnerability | report.jsonl/bottle.py | python 补丁 |
| 18 | tb-merge-diff-arc-agi-task | repo/ | git merge |
| 19 | tb-openssl-selfsigned-cert | ssl/*.crt | openssl cli |
| 20 | tb-large-scale-text-editing | apply_macros.vim | vim（宿主机已装） |

### 边界/暂缓（需要逐个验证宿主机依赖，先不纳入主样本）
extract-elf(node)、password-recovery(forensic tools)、vulnerable-secret(二进制 exploit)、
modernize-scientific-stack(pip 装栈)、model-extraction-relu-logits(torch?)、headless-terminal(PTY)、
schemelike-metacircular-eval(scheme 解释器)、dna-insert/dna-assembly(domain libs)

### 明确需容器（不纳入，留给 Docker 适配器方案，~46 个）
所有 build-*/compile-*/make-*、qemu-*、nginx/grpc/pypi/mailman、caffe/torch/stan/mteb/fasttext/sam、
coq/ocaml/mips/doom/pov-ray/compcert/windows-3.11、crack-7z、bn-fit(R)、code-from-image(OCR)、
protein-assembly(网络)、portfolio-optimization(.so) 等。

## 执行计划

1. **批量 JIT**（待确认后启动）：对上述 20 个新 skill 跑 `skvm jit-optimize`
   （optimizer=deepseek-v4-flash, adapter=bare-agent, 含 round-0 baseline），WSL 环境。
2. **四条件 benchmark**：`skvm bench --conditions=no-skill,original,jit`（aot 视已有提案补充）。
3. **汇总报告**：passRate / avgScore / avgTokens / avgCost / avgDurationMs / toolCalls 的 before/after 表。

## 已识别的 SkVM 改进点（Task 4 输入）
- bare-agent ≠ 容器：硬契约任务无法评估（最大瓶颈，待 Docker 适配器）。
- 收敛即跳过（score≥0.95）：已满分任务不追求降本，与「降低执行成本」目标存在缺口。
