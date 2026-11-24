#!/usr/bin/env bash
# CI-only stand-in for tailcat. It implements the three subcommands the plugin
# calls, prints a fixed synthetic address, and emits a couple of access records
# so the screenshot shows the diagnostics sections populated.
set -euo pipefail

sub=""
for arg in "$@"; do
  case "$arg" in
    version|genkey|serve) sub="$arg"; break ;;
  esac
done

ADDRESS="tcFAKEqR7mN2wK5xJ8vB3cF6hL9pS4dG1tY0uI7oP2aS5dF8gH1jK4lZ7xC0vB3nM6qW9eR2tY5uI8oP1aS4dF7gH0jK3lZ6xC9vB2nM5qW8eR1tY4uI7oP0aS3dF6gH9jK2lZ5x"

case "$sub" in
  version)
    printf 'tailcat version v0.8.0\n'
    ;;
  genkey)
    key=""
    for arg in "$@"; do
      case "$arg" in --key=*) key="${arg#--key=}" ;; esac
    done
    if [[ "$key" == */* ]]; then
      file="$key"
    else
      file="${XDG_CONFIG_HOME:-$HOME/.config}/tailcat/keys/$key.private.json"
    fi
    mkdir -p "$(dirname "$file")"
    printf '{"fake":true}\n' > "$file"
    chmod 600 "$file"
    printf '# wrote file to %s\n' "$file" >&2
    printf 'nodekey:%064d\n' 0
    ;;
  serve)
    printf '{"listenAddr":"%s"}\n' "$ADDRESS"
    printf '# Selected bootstrap relay region 304, Tokyo\n' >&2
    printf '# 🐈 Server listening with saved key "dsh-tailcat": %s\n' "$ADDRESS" >&2
    peer="nodekey:$(printf 'a%.0s' {1..64})"
    printf '2026/11/24 16:25:20 [conn] open peer=%s proto=tcp port=13080 service=forward via=direct:192.0.2.10:51352\n' "$peer" >&2
    printf '2026/11/24 16:25:24 [conn] close peer=%s proto=tcp port=13080 service=forward duration=4.208s\n' "$peer" >&2
    printf '2026/11/24 16:25:26 [peer] refused key=nodekey:%064d reason=not-in-allow\n' 1 >&2
    exec sleep infinity
    ;;
  *)
    printf 'tailcat stub: unsupported invocation: %s\n' "$*" >&2
    exit 2
    ;;
esac
