#!/usr/bin/env sh
set -eu

strict_fail() {
  echo "[strict-flow] $*" >&2
  exit 1
}

strict_run_qa() {
  echo "[strict-flow] Running qa:gate..."
  npm run --silent qa:gate
}

strict_check_openspec_conflicts() {
  if git diff --cached --name-only | grep -qx ".openspec.json" && [ -f "./scripts/check-openspec-conflicts.mjs" ]; then
    echo "[strict-flow] Checking OpenSpec conflicts..."
    set +e
    node ./scripts/check-openspec-conflicts.mjs
    code=$?
    set -e
    [ "$code" -eq 1 ] && strict_fail "OpenSpec conflicts detected; resolve them before commit."
    [ "$code" -eq 2 ] && echo "[strict-flow] OpenSpec warnings detected; continuing because they are non-blocking."
  fi
}

strict_run_doc_hook() {
  phase="$1"
  if [ -f "./scripts/openspec-doc-hook.mjs" ]; then
    node ./scripts/openspec-doc-hook.mjs "$phase" 2>/dev/null || true
  fi
}

strict_require_no_unstaged_changes() {
  if ! git diff --quiet --; then
    git status --short
    strict_fail "QA or hooks changed tracked files. Stage those files and commit again."
  fi

  untracked="$(git ls-files --others --exclude-standard)"
  if [ -n "$untracked" ]; then
    echo "$untracked"
    strict_fail "Untracked files remain. Add them to the commit or ignore them before committing."
  fi
}

strict_require_clean_worktree() {
  if ! git diff --quiet -- || ! git diff --cached --quiet --; then
    git status --short
    strict_fail "Tracked changes remain after QA. Commit them before push."
  fi

  untracked="$(git ls-files --others --exclude-standard)"
  if [ -n "$untracked" ]; then
    echo "$untracked"
    strict_fail "Untracked files remain. Add them to a commit or ignore them before push."
  fi
}

strict_post_commit_sync_and_push() {
  branch="$(git rev-parse --abbrev-ref HEAD)"

  if [ "$branch" = "HEAD" ]; then
    echo "[strict-flow] Detached HEAD detected; skipping auto-push."
    exit 0
  fi

  strict_run_doc_hook post-commit

  echo "[strict-flow] Fetching origin/$branch..."
  git fetch --quiet origin "$branch" || true

  local_head="$(git rev-parse HEAD)"
  remote_head="$(git rev-parse "origin/$branch" 2>/dev/null || echo "")"

  if [ -n "$remote_head" ] && [ "$local_head" != "$remote_head" ]; then
    echo "[strict-flow] Syncing with origin/$branch via rebase..."
    git pull --rebase --autostash origin "$branch" || strict_fail "Rebase failed. Resolve conflicts, rerun qa:gate, then commit/push again."
  fi

  strict_run_qa
  strict_require_clean_worktree

  echo "[strict-flow] Pushing branch '$branch'..."
  git push --set-upstream origin "$branch"
}
