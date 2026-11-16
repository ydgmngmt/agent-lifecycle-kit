# Shared by lc-spawn, lc-close and lc-view. Reads one key of the `sessions:` block of
# .agents/project.yaml in the given directory's repository. Usage: lc_conf <dir> <key> [default]
lc_conf() {
  local root file value
  root=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null) || root="$1"
  file="$root/.agents/project.yaml"
  value=""
  if [[ -f $file ]]; then
    value=$(awk -v key="$2" '
      /^[^ #]/ { in_block = ($0 ~ /^sessions:/) ; next }
      in_block && $1 == key ":" {
        sub(/^[^:]*:[ \t]*/, ""); sub(/[ \t]+#.*$/, ""); gsub(/^"|"$/, ""); print; exit
      }' "$file")
  fi
  printf '%s' "${value:-$3}"
}

# Any key of .agents/project.yaml: a top-level key, or `block.key` one level down.
# The value stops before an inline comment or a ` — note`. Usage: lc_get <dir> <key> [default]
lc_get() {
  local root file value
  root=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null) || root="$1"
  file="$root/.agents/project.yaml"
  value=""
  if [[ -f $file ]]; then
    value=$(awk -v want="$2" '
      /^[A-Za-z_-]+:/ { block = $1; sub(/:$/, "", block); key = block }
      /^  [A-Za-z_-]+:/ { key = block "." $1; sub(/:$/, "", key) }
      /^ ?[A-Za-z_-]+:|^  [A-Za-z_-]+:/ && key == want {
        sub(/^[^:]*:[ \t]*/, ""); sub(/[ \t]+#.*$/, ""); sub(/[ \t]+—.*$/, ""); gsub(/^"|"$/, ""); print; exit
      }' "$file")
  fi
  value=${value:-${3:-}}
  printf '%s' "${value/#\~/$HOME}"
}

# The board's data dir: board.data_dir, else <handoff_dir>/board, else <repo>/.agents/board;
# LC_BOARD_DIR overrides it. Usage: lc_board_dir <dir>
lc_board_dir() {
  local root handoff data
  root=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null) || root="$1"
  handoff=$(lc_get "$root" handoff_dir)
  data=${LC_BOARD_DIR:-$(lc_get "$root" board.data_dir "${handoff:+$handoff/board}")}
  printf '%s' "${data:-$root/.agents/board}"
}
