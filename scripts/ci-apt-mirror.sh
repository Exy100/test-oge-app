#!/usr/bin/env bash
set -euo pipefail

# Probe before rewriting sources: the primary archive can have DNS outages.
# APT still verifies Ubuntu signatures using the original distribution keys.
select_mirror() {
  local codename="$1" candidate suite available
  for candidate in https://archive.ubuntu.com/ubuntu https://mirrors.edge.kernel.org/ubuntu https://mirrors.mit.edu/ubuntu; do
    available=true
    for suite in "$codename" "$codename-updates" "$codename-backports" "$codename-security"; do
      if ! curl --fail --silent --show-error --location --connect-timeout 4 --max-time 10 "$candidate/dists/$suite/InRelease" --output /dev/null; then
        available=false
        break
      fi
    done
    if "$available"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo 'No reachable Ubuntu mirror includes all required suites.' >&2
  return 1
}

rewrite_sources() {
  local mirror="$1" source_file
  shift
  for source_file in "$@"; do
    if [[ -f "$source_file" ]]; then
      sudo sed -i -E "s#https?://(azure\\.archive|archive|security)\\.ubuntu\\.com/ubuntu#${mirror}#g" "$source_file"
    fi
  done
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  ubuntu_codename="$(. /etc/os-release; printf '%s' "${VERSION_CODENAME:?}")"
  ubuntu_mirror="$(select_mirror "$ubuntu_codename")"
  echo "Using Ubuntu mirror: $ubuntu_mirror"
  rewrite_sources "$ubuntu_mirror" /etc/apt/apt-mirrors.txt /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources
fi
