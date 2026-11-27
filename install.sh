#!/usr/bin/env bash
# Install the kit for Codex and the shell. Claude Code loads it as a plugin instead (README).
#  - skills/* are linked into ~/.agents/skills, which Codex reads;
#  - bin/lc-* are linked into ~/.local/bin.
# It never overwrites an existing entry that isn't its own link. Run again after `git pull`;
# `install.sh --uninstall` removes the links.
set -euo pipefail
kit=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
skills_dir=${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}
bin_dir=${LC_BIN_DIR:-$HOME/.local/bin}
mkdir -p "$skills_dir" "$bin_dir"

link() { # link <target> <link-path>
  if [[ -L $2 && $(readlink -f "$2") == "$(readlink -f "$1")" ]]; then return; fi
  if [[ -e $2 || -L $2 ]]; then echo "skip $2: exists and is not this kit's link" >&2; return; fi
  ln -s "$1" "$2"; echo "linked $2"
}
unlink_own() { # unlink_own <target> <link-path>
  if [[ -L $2 && $(readlink -f "$2") == "$(readlink -f "$1")" ]]; then rm "$2"; echo "removed $2"; fi
}

# Remove links left by skills the kit no longer has.
for l in "$skills_dir"/*; do
  if [[ -L $l && ! -e $l && $(readlink "$l") == "$kit"/skills/* ]]; then rm "$l"; echo "removed stale $l"; fi
done

action=link
[[ ${1:-} == --uninstall ]] && action=unlink_own
for s in "$kit"/skills/*/; do s=${s%/}; $action "$s" "$skills_dir/$(basename "$s")"; done
for b in "$kit"/bin/lc-spawn "$kit"/bin/lc-close "$kit"/bin/lc-view "$kit"/bin/lc-board "$kit"/bin/lc-gate "$kit"/bin/lc-rules "$kit"/bin/lc-tell "$kit"/bin/lc-log "$kit"/bin/lc-park "$kit"/bin/lc-pstack "$kit"/bin/lc-criteria "$kit"/bin/lc-tools; do $action "$b" "$bin_dir/$(basename "$b")"; done
