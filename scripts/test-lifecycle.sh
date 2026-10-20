#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
just --justfile ./justfile setup
just --justfile ./justfile setup
PI_OFFLINE=1 just --justfile ./justfile run --no-extensions --list-models >/dev/null
