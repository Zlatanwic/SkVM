---
name: tb-fix-git
description: Recover lost Git commits from a detached HEAD state and merge them back into master. Use this skill whenever the task involves a user saying they "lost changes after checking out master," finding dangling commits via `git reflog`, recovering work from a detached HEAD, merging orphaned commits into the current branch, or working inside the `fix-git` Docker container. Also trigger when the user mentions making changes on a branchless checkout, needing to fish commits out of the reflog, or recovering apparently-lost work in a Git repository where `git log` doesn't show the expected commits.
---

# tb-fix-git

Recover commits that were made on a detached HEAD, then merge them into the
`master` branch so the user's personal site changes are restored. This is one
of the Terminal-Bench 2.1 task skills; the full task lives at
`tasks/fix-git/` in the same repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `fix-git` Docker container and needs
to recover "lost" commits after accidentally checking out master. Do **not**
use it for complex Git history rewriting, rebase conflicts, or submodule
issues — this is specifically about the detached HEAD recovery pattern where
commits exist but are not reachable from any branch.

## Goal (one sentence)

Find the orphaned commits made on a detached HEAD, merge them into `master`,
and ensure the changes from those commits are present on the master branch.

## Required outputs

| File | Purpose |
|---|---|
| Git repository in consistent state | The `master` branch must contain the previously-detached commits, with no data loss. No file artifact is required; the verifier checks the Git history directly. |

The verifier inspects the repository's commit graph to confirm that:
(1) the lost commits are now reachable from `master`, and
(2) no irrelevant history was altered.

## Recommended workflow

### 1. Diagnose the situation (≈ 2 min)

```bash
cd /app  # or wherever the repo lives; check the container layout

# See where we are
git status
git branch
git log --oneline --all --graph

# The detached HEAD commits won't appear in 'git log' because
# they aren't reachable from any branch. Use the reflog.
git reflog
```

The reflog records every place HEAD has pointed. Look for entries like:

```
abc1234 HEAD@{0}: checkout: moving from 1a2b3c4... to master
1a2b3c4 HEAD@{1}: commit: Made changes to personal site
def5678 HEAD@{2}: commit: Updated styles
...
```

The commits `1a2b3c4` and `def5678` before the `checkout: moving to master`
entry are the lost work.

### 2. Recover the commits (≈ 2 min)

Several recovery strategies, ranked by safety:

**Strategy A: Create a branch at the lost commit (safest)**

```bash
# Point a new branch at the lost commit
git branch recovered-work 1a2b3c4

# Now merge it into master
git checkout master
git merge recovered-work

# Clean up the temporary branch
git branch -d recovered-work
```

**Strategy B: Cherry-pick the lost commits**

```bash
# Cherry-pick each lost commit onto master
git cherry-pick def5678
git cherry-pick 1a2b3c4
```

**Strategy C: Merge the detached HEAD directly**

```bash
# If you know the hash, merge it directly
git merge 1a2b3c4
```

### 3. Verify the recovery (≈ 1 min)

```bash
# Confirm the changes are on master
git log --oneline master

# Check that the expected files exist
ls -la

# Verify no merge conflicts remain
git status
```

- The recovered commits' changes should be visible in the working tree.
- `git status` should show a clean state (or only intentional changes).
- The commit messages from the lost commits should appear in `git log`.

## Verifier checklist (must all pass)

- [ ] The lost commits are reachable from the `master` branch.
- [ ] The working tree contains the changes from those commits.
- [ ] No irrelevant history has been modified (other commits untouched).
- [ ] The repository is in a clean state (no merge conflicts, no dangling
      temporary branches).

## Common pitfalls

1. **Using `git reset --hard` before understanding the situation.** This
   destroys the reflog entries for the current branch. If you reset master
   before recovering, you may lose the recovery path. Always inspect first;
   never reset hard as a first move.
2. **Forgetting to check the reflog.** `git log` only shows reachable commits.
   The detached HEAD commits are unreachable from any branch and will not
   appear in `git log` or `git log --all`. The reflog (`git reflog` or
   `git log -g`) is the only way to find them unless you noted the hashes.
3. **Creating a mess with `git checkout <hash>` again.** If you check out the
   lost commit hash directly, you are back on a detached HEAD. Always create
   a named branch first (`git branch temp <hash>`) or merge directly from
   the hash.
4. **Missing the fact that reflog entries expire.** In a real scenario, reflog
   entries older than 90 days (by default) may be garbage-collected. But in
   this task, the commits are recent so the reflog should have them.
5. **Merging in the wrong direction or onto the wrong branch.** Make sure you
   are on `master` when merging the recovered work. Merging master into a
   temporary recovery branch gets the direction backwards.

## Quick sanity test (run after recovery)

```bash
# Check that the lost commit's message appears in master's log
git log --oneline master | head -10

# Check reflog shows the recovery
git reflog | head -5

# Verify working tree is clean
git status
```

## Reference pointers

- `git reflog` documentation: `git help reflog` — the definitive reference for
  recovering "lost" commits.
- Pro Git book, chapter "Git Internals - Maintenance and Data Recovery":
  https://git-scm.com/book/en/v2/Git-Internals-Maintenance-and-Data-Recovery
- The task's Git repository is the ground truth; use `git reflog`, `git fsck`,
  and `git log --all --graph` to map the full state.
- `git fsck --lost-found` can also find dangling commits if the reflog is
  insufficient.
