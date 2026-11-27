#!/usr/bin/env bash
# Runs one of the kit's CI checks on a pull request by its base commit's copy of the rules: the
# project file (paths, step lists, modes), the scripts in .agents/ci/ and the file of accepted PR body
# lines, so a pull request can't loosen the check that judges it. A pull request that changes one of
# them gets a loud line: those files are protected_files, and the owner reads them before merging.
# The workflows take this script itself from the base commit too.
# Install: copy to .agents/ci/from-base.sh (templates/ci/pr.yml and pr-body.yml call it there).
#   bash .agents/ci/from-base.sh <base sha> <head sha> <kit checkout> pr-body
set -euo pipefail
base=$1 head=$2 kit=$3 job=$4
cd -- "$(git rev-parse --show-toplevel)"

changed=$(git diff --name-only "$base" "$head" -- .agents/project.yaml .agents/ci .github/workflows | tr '\n' ' ')
if [ -n "$changed" ]; then
  echo "::warning::PROTECTED GATE CHANGE: ${changed}- judged by the base commit's copy; the owner must read these files before merging."
  echo "from-base: PROTECTED GATE CHANGE (${changed% }): judged by ${base:0:9}'s copy; the owner must read it."
fi

case $job in
  pr-body)
    # The base's check script; it reads the project file and the accepted lines at the base itself.
    side=$(mktemp -d)
    trap 'rm -rf "$side"' EXIT
    git show "$base:.agents/ci/pr-body-check.mjs" > "$side/pr-body-check.mjs" 2>/dev/null \
      || cp .agents/ci/pr-body-check.mjs "$side/pr-body-check.mjs" # only the PR that adds it
    node "$side/pr-body-check.mjs" "$kit" "$base" "$head"
    ;;
  *)
    echo "usage: from-base.sh <base> <head> <kit> pr-body" >&2
    exit 2
    ;;
esac
