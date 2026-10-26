#!/usr/bin/env bash
set -euo pipefail

# GitHub Ubuntu images can use a very slow Azure mirror. Keep the distribution,
# suites, components and signing keys; select Ubuntu's official archive host.
for source_file in /etc/apt/apt-mirrors.txt /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  if [[ -f "$source_file" ]]; then
    sudo sed -i 's#://azure\.archive\.ubuntu\.com/ubuntu#://archive.ubuntu.com/ubuntu#g' "$source_file"
  fi
done
