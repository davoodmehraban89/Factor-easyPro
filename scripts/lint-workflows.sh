#!/usr/bin/env bash
# Validate GitHub's workflow structure, not only YAML syntax. Disposable Linux CI.
set -euo pipefail

version=1.7.7
archive_sha256=023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757
lint_dir=$(mktemp -d)
trap 'rm -rf "$lint_dir"' EXIT
curl --fail --silent --show-error --location \
  "https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_linux_amd64.tar.gz" \
  --output "$lint_dir/actionlint.tar.gz"
printf '%s  %s\n' "$archive_sha256" "$lint_dir/actionlint.tar.gz" | sha256sum --check --status
tar -xzf "$lint_dir/actionlint.tar.gz" -C "$lint_dir" actionlint
# PowerShell steps are parsed by the Windows jobs. These optional Python/shell
# linters are not required for the Actions schema/expression validation gate.
"$lint_dir/actionlint" -shellcheck= -pyflakes= "$@"
