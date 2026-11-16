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
