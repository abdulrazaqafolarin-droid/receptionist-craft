#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  cat <<'USAGE'
Usage: scripts/check_pr_contradictions.sh <base_branch> <pr_branch_1> [<pr_branch_2> ...]

Checks whether each PR branch can merge cleanly into the base branch and whether PR
branches contradict each other (conflict with each other at their merge base).

Example:
  scripts/check_pr_contradictions.sh main pr/101 pr/102 pr/103
USAGE
  exit 1
fi

base_branch="$1"
shift
pr_branches=("$@")

if ! git rev-parse --verify "$base_branch" >/dev/null 2>&1; then
  echo "Base branch '$base_branch' does not exist locally." >&2
  exit 1
fi

for branch in "${pr_branches[@]}"; do
  if ! git rev-parse --verify "$branch" >/dev/null 2>&1; then
    echo "PR branch '$branch' does not exist locally." >&2
    exit 1
  fi
done

tmp_branch="tmp/pr-contradiction-check-$$"
cleanup() {
  git checkout -q "$base_branch" >/dev/null 2>&1 || true
  git branch -D "$tmp_branch" >/dev/null 2>&1 || true
}
trap cleanup EXIT

report_file="$(mktemp)"

echo "== Per-PR compatibility with $base_branch =="
for branch in "${pr_branches[@]}"; do
  git checkout -q "$base_branch"
  git checkout -q -b "$tmp_branch"

  if git merge --no-commit --no-ff "$branch" >/dev/null 2>&1; then
    echo "[OK] $branch merges cleanly into $base_branch"
    echo "OK|$branch|$base_branch" >> "$report_file"
  else
    echo "[CONFLICT] $branch conflicts with $base_branch"
    echo "CONFLICT|$branch|$base_branch" >> "$report_file"
  fi

  git merge --abort >/dev/null 2>&1 || true
  git checkout -q "$base_branch"
  git branch -D "$tmp_branch" >/dev/null 2>&1
done

echo
echo "== Pairwise contradiction check (PR vs PR) =="
for ((i=0; i<${#pr_branches[@]}; i++)); do
  for ((j=i+1; j<${#pr_branches[@]}; j++)); do
    a="${pr_branches[$i]}"
    b="${pr_branches[$j]}"

    merge_base="$(git merge-base "$a" "$b")"
    merge_tree_output="$(git merge-tree "$merge_base" "$a" "$b")"

    # git merge-tree conflict markers may appear inside patch hunks prefixed by
    # diff symbols (for example: "+<<<<<<< .our"), so match an optional patch
    # marker before the standard conflict marker.
    if printf '%s' "$merge_tree_output" | rg -q '^[- +]?<<<<<<< '; then
      echo "[CONTRADICTION] $a <-> $b"
      echo "CONTRADICTION|$a|$b" >> "$report_file"
    else
      echo "[OK] $a and $b can be merged together"
      echo "PAIR_OK|$a|$b" >> "$report_file"
    fi
  done
done

echo
echo "== Suggested next steps =="
if rg -q '^CONFLICT\|' "$report_file"; then
  echo "- Rebase each conflicting branch onto $base_branch and resolve conflicts intentionally."
fi

if rg -q '^CONTRADICTION\|' "$report_file"; then
  echo "- For contradictory branch pairs, decide source of truth by domain owner and submit one reconciliation PR."
else
  echo "- No branch contradictions detected among the provided PR branches."
fi

rm -f "$report_file"
