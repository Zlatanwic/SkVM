---
name: tb-git-leak-recovery
description: Recover a leaked secret from unreachable Git objects and completely purge it from the repository history while preserving legitimate commits. Use this skill whenever the task involves finding a secret in Git history that was "removed by rewriting history," recovering secrets from dangling blobs/commits using `git fsck` or `git reflog`, cleaning a repository so a `secret[...]`-format string cannot be found anywhere, writing the recovered secret to `/app/secret.txt`, or working inside the `git-leak-recovery` Docker container. Also trigger when the user needs to use `git filter-branch` or `BFG Repo-Cleaner` to expunge sensitive data, search unreachable objects in `.git/objects`, or handle the "secret was accidentally committed then history was rewritten" scenario.
---

# tb-git-leak-recovery

Recover a secret (format `secret[...]`) that was accidentally committed to a
Git repository at `/app/repo`, then rewritten out of history, and ensure it is
completely purged from the repository. This is one of the Terminal-Bench 2.1
task skills; the full task lives at `tasks/git-leak-recovery/` in the same
repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `git-leak-recovery` Docker container
and needs to: (1) find a secret that was thought to be removed from history,
(2) write it to `/app/secret.txt`, and (3) fully purge it from the repo. Do
**not** use it for general Git history editing or secret rotation workflows —
this is specifically about recovering secrets from unreachable Git objects and
then properly expunging them.

## Goal (one sentence)

Recover the `secret[...]` string from dangling Git objects, write it to
`/app/secret.txt`, then permanently purge it from the repository so `grep`
cannot find it anywhere in `.git/` or the working tree.

## Required outputs

| File | Purpose |
|---|---|
| `/app/secret.txt` | The recovered secret string in `secret[...]` format. |
| `/app/repo/` (cleaned) | The repository after complete secret removal — no trace of the secret in the working tree, Git history, reflog, or object store. |

The verifier checks that: (1) `/app/secret.txt` contains the correct secret,
(2) the secret cannot be found anywhere in the repo using `grep -r`, and
(3) legitimate commits and files remain untouched.

## Recommended workflow

### 1. Recover the secret from Git objects (≈ 5 min)

Even after `git reset` + `git commit --amend` or `git rebase -i` to remove a
commit, the original objects remain in Git's object database until garbage
collection. Find them:

```bash
cd /app/repo

# Method 1: Find dangling/unreachable commits and blobs
git fsck --lost-found --no-reflogs

# This lists:
#   dangling commit <hash> — commits not reachable from any ref
#   dangling blob <hash>   — file contents not reachable from any commit

# Method 2: Search all objects for the secret pattern
git grep -i secret $(git rev-list --all) 2>/dev/null || true

# Method 3: Search the raw object store
find .git/objects -type f | while read obj; do
    git cat-file -p $(echo $obj | sed 's|.git/objects/||;s|/||') 2>/dev/null
done | grep -i 'secret\['

# Method 4: Reflog (if the secret was in a recent commit that was amended)
git reflog
git show HEAD@{1}   # Previous position of HEAD before the rewrite
git show HEAD@{2}
# ... check each reflog entry
```

The most reliable approach: find all dangling blobs and inspect their content:

```bash
git fsck --lost-found 2>/dev/null | grep 'dangling blob' | awk '{print $3}' | while read hash; do
    content=$(git cat-file -p $hash 2>/dev/null)
    if echo "$content" | grep -qi 'secret\['; then
        echo "Found in blob $hash"
        echo "$content"
    fi
done
```

### 2. Write the secret to file (≈ 1 min)

```bash
# Extract just the secret string
echo 'secret[the_actual_secret]' > /app/secret.txt
cat /app/secret.txt
```

The format is `secret[...]` with the secret value between square brackets.
There is only one such string in the entire repository.

### 3. Purge the secret from the repo (≈ 10 min)

This is the hard part. The secret may exist in:
- Unreachable (dangling) objects
- The reflog
- Old pack files
- The working tree (if someone extracted it)

Complete purge procedure:

```bash
cd /app/repo

# Step 1: Expire the reflog
git reflog expire --expire=now --all

# Step 2: Remove unreachable objects and pack refs
git gc --prune=now --aggressive

# Step 3: If the secret is still reachable (it was in a commit that
# wasn't fully rewritten), use filter-branch or BFG to remove it
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch <file_containing_secret>" \
  --prune-empty --tag-name-filter cat -- --all

# Step 4: Alternative: use git filter-repo (more modern)
# pip install git-filter-repo
# git filter-repo --path <file_containing_secret> --invert-paths

# Step 5: Clean up after filter-branch
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Step 6: Verify the secret is gone
grep -r 'secret\[' .git/ 2>/dev/null
grep -r 'secret\[' . --exclude-dir=.git 2>/dev/null
# Both should return nothing
```

If the secret was in a file that needs to be kept but with the secret removed:

```bash
# Remove the secret line from the file, commit the change
# Then use filter-branch to remove it from all historical versions too
```

### 4. Verify the cleanup (≈ 2 min)

```bash
cd /app/repo

# Check: no secret in working tree or tracked files
grep -r 'secret\[' . --exclude-dir=.git
# Expected: no output

# Check: no secret in any Git object
git rev-list --all | xargs -I{} sh -c 'git grep "secret\[" {} || true'
# Expected: no output (each command may print its own error, but
# no actual matches)

# Check: no secret in dangling objects
git fsck --lost-found 2>/dev/null | grep 'dangling blob' | awk '{print $3}' | while read h; do
    git cat-file -p $h 2>/dev/null
done | grep 'secret\[' && echo "FAIL: secret still in dangling blob" || echo "PASS"
```

## Verifier checklist (must all pass)

- [ ] `/app/secret.txt` exists and contains the correct `secret[...]` string.
- [ ] The secret cannot be found anywhere in `/app/repo/` (including `.git/`
      objects, reflog, pack files, and working tree).
- [ ] Irrelevant files and commit messages remain untouched.
- [ ] The repository is in a usable state (not corrupted).

## Common pitfalls

1. **Only searching the working tree, not Git objects.** The secret was
   "removed by rewriting history" — it no longer exists in the tip of any
   branch. But it still lives in unreachable objects (dangling blobs/commits).
   You must search `.git/objects/` and the pack files with `git fsck
   --lost-found`.
2. **`git gc` not aggressive enough.** `git gc` without `--prune=now` or
   `--aggressive` may not actually delete unreachable objects because Git
   keeps them for safety (default grace period is 2 weeks). Use
   `git gc --prune=now --aggressive` after expiring the reflog.
3. **Forgetting to expire the reflog.** Even after removing the secret from
   all branches, the reflog keeps references to old commits for 90 days by
   default. `git reflog expire --expire=now --all` is essential before
   garbage collection.
4. **Rewriting history in a way that corrupts other commits.** When using
   `git filter-branch`, make sure your filter only removes the secret, not
   unrelated files or commit metadata. The instruction says "irrelevant files
   and commit messages remain untouched."
5. **The secret was in the commit message, not a file.** `git rm --cached` in
   filter-branch only affects file contents. If the secret is in a commit
   message, you need `--msg-filter` to rewrite it: `git filter-branch --msg-filter
   'sed "s/secret\[.*\]/[REDACTED]/"' ...`.

## Quick sanity test (run after cleanup)

```bash
# Final verification
cd /app/repo
echo "=== Checking working tree ==="
grep -r 'secret\[' . --exclude-dir=.git && echo "FAIL" || echo "PASS: no secret in working tree"

echo "=== Checking all Git objects ==="
git rev-list --all | while read hash; do
    git grep -q 'secret\[' $hash 2>/dev/null && echo "FAIL in $hash"
done && echo "PASS: no secret in reachable commits"

echo "=== Checking dangling objects ==="
git fsck --lost-found 2>/dev/null | grep 'dangling blob' | awk '{print $3}' | while read h; do
    git cat-file -p $h 2>/dev/null | grep -q 'secret\[' && echo "FAIL in blob $h"
done && echo "PASS: no secret in dangling blobs"

echo "=== Secret file ==="
cat /app/secret.txt
```

## Reference pointers

- `git fsck` documentation: `git help fsck` — the primary tool for finding
  unreachable objects.
- `git filter-branch` documentation: `git help filter-branch` — for rewriting
  history to remove secrets.
- GitHub's guide on removing sensitive data:
  https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- BFG Repo-Cleaner: faster alternative to `git filter-branch` for removing
  files or strings from history. Install via `apt-get install bfg` or download
  the JAR.
- `git filter-repo` (recommended modern replacement for filter-branch):
  `pip install git-filter-repo`.
- The task repository is at `/app/repo` — all Git operations should target
  this path, not `/app/` itself.
