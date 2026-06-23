---
name: tb-sanitize-git-repo
description: Scan a Git repository for hardcoded API keys and tokens, replacing them with consistent placeholders without modifying clean files. Use this skill when the task mentions sanitizing a repo, finding API keys, replacing secrets with placeholders (`<your-aws-access-key-id>`, `<your-github-token>`, `<your-huggingface-token>`), or cleaning the "dclm" repository. Also trigger when the user references security scanning, credential removal, `git grep` for secrets, or needs to ensure no sensitive values remain after sanitization.
---

# tb-sanitize-git-repo

Identify and replace all hardcoded API keys, tokens, and secrets in the `dclm`
Git repository with descriptive placeholders, without touching any files that
do not contain sensitive information. This is a Terminal-Bench 2.1 task; the
full task lives at `tasks/sanitize-git-repo/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `sanitize-git-repo` Docker container
and needs to find and replace credentials in a Git repo. Do **not** use it for
general-purpose `.gitignore` configuration or setting up secret managers --
this is specifically about scrubbing already-committed secrets from tracked files.

## Goal (one sentence)

Find every API key, token, and credential in the repository and replace its
value with a consistent placeholder string, leaving all other files untouched.

## Required outputs

| Output | Purpose |
|---|---|
| Clean repository | All files in the `dclm` repo: sensitive values replaced with placeholders (`<your-aws-access-key-id>`, `<your-aws-secret-access-key>`, `<your-github-token>`, `<your-huggingface-token>`). No sensitive value remains anywhere. |
| Untouched clean files | Files without secrets must remain bit-for-bit identical to their original state. |

## Recommended workflow

### 1. Survey the repository (≈ 3 min)

- `cd` into the repository root (likely `/app/dclm` or similar).
- Run `git log --oneline -5` to understand recent history.
- List all tracked files: `git ls-files`.
- Check file types present: shell scripts, Python, config files, JSON, YAML, etc.

### 2. Scan for secrets (≈ 5 min)

Use multiple strategies in parallel:

```bash
# AWS-style keys
git grep -E '(AKIA|ASIA)[A-Z0-9]{16}' || grep -rE '(AKIA|ASIA)[A-Z0-9]{16}' .

# Generic key-like patterns
git grep -E '(SECRET|TOKEN|KEY|PASSWORD|PASSWD)' -i

# GitHub tokens
git grep -E 'ghp_[A-Za-z0-9]{36}' || grep -rE 'ghp_[A-Za-z0-9]{36}' .

# HuggingFace tokens
git grep -E 'hf_[A-Za-z0-9]{34}' || grep -rE 'hf_[A-Za-z0-9]{34}' .

# Base64-encoded secrets (common in env/config files)
git grep -E '[A-Za-z0-9+/]{40,}={0,2}'

# Common credential filenames
find . -type f \( -name '.env' -o -name 'credentials*' -o -name 'secrets*' -o -name '*.pem' \)
```

### 3. Classify each finding (≈ 3 min)

For each match, determine:
- **Is it a real secret?** Distinguish between actual keys and placeholder/template
  strings. A file with `AWS_ACCESS_KEY_ID=<your-aws-access-key-id>` is already
  clean and must not be modified.
- **Which placeholder to use?**
  - AWS Access Key ID (starts with `AKIA` or `ASIA`) -> `<your-aws-access-key-id>`
  - AWS Secret Access Key -> `<your-aws-secret-access-key>`
  - GitHub token (`ghp_...`) -> `<your-github-token>`
  - HuggingFace token (`hf_...`) -> `<your-huggingface-token>`
  - Other patterns -> infer a sensible placeholder following the same naming scheme.

### 4. Replace (≈ 5 min)

- Use `sed -i` or a Python script to replace actual secret values with placeholders.
- **Critical**: Only replace the *value*, not the variable name. For example:
  - `export AWS_ACCESS_KEY_ID=AKIA1234567890ABCD` becomes
    `export AWS_ACCESS_KEY_ID=<your-aws-access-key-id>`.
- Keep placeholders consistent: the same placeholder string everywhere for the
  same type of secret.
- Test: after replacement, run the same grep patterns to confirm zero matches
  for real secret patterns.

### 5. Verify (≈ 2 min)

- Re-run all the grep patterns from step 2. They should now return only the
  placeholder strings or no matches (for the real-secret patterns).
- `git diff` to review every changed line. Each change must be a secret->placeholder
  substitution. No clean lines should be modified.

## Verifier checklist (must all pass)

- [ ] No real API key, token, or secret value exists anywhere in the repository.
- [ ] Each removed secret is replaced with a descriptive placeholder (`<your-...>`).
- [ ] Placeholders are consistent across the repo (same type = same placeholder).
- [ ] No file without secrets was modified (byte-identical to original).
- [ ] No files were deleted that should have been kept.

## Common pitfalls

1. **Matching false positives.** Commented-out examples, documentation, or
   template configuration often contain dummy keys or placeholder strings. Do
   not replace placeholders with more placeholders. Look at the surrounding
   context, not just the regex match.
2. **Replacing the variable name instead of the value.** `AWS_ACCESS_KEY_ID`
   is the variable name and should stay. Only the `AKIA...` on the right side
   gets replaced.
3. **Inconsistent placeholder naming.** Using `<your-aws-key>` in one file and
   `<your-aws-access-key-id>` in another for the same secret type creates
   confusion. Pick the exact placeholder from the instruction and use it
   uniformly.
4. **Modifying clean files.** Accidentally changing whitespace, line endings, or
   a comment in a file that had no secrets will fail the verifier. Use precise
   string-matching replacements, not broad `sed` expressions.
5. **Missing secrets in binary or unusual files.** Check `.env`, `.ini`, `.toml`,
   `.yaml`, `.json`, and shell scripts. Secrets can hide in unexpected places.

## Reference pointers

- AWS access key format: starts with `AKIA` (long-term) or `ASIA` (temporary),
  16 uppercase alphanumeric characters.
- GitHub personal access tokens: `ghp_` prefix, 36 alphanumeric characters.
- HuggingFace tokens: `hf_` prefix, 34 alphanumeric characters.
- Use `git grep` for content search that respects `.gitignore`; fall back to
  `grep -r` for untracked files that may also contain secrets.
