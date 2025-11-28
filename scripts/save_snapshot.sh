#!/usr/bin/env bash

set -euo pipefail

REFERENCE=${1:-}
if [[ -z "$REFERENCE" ]]; then
  echo "Usage: $0 <reference>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT_DIR="$ROOT_DIR/vault"
mkdir -p "$VAULT_DIR"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
SAFE_REFERENCE="$(echo "$REFERENCE" | tr '[:space:]' '_' | tr -cd 'A-Za-z0-9_-')"
if [[ -z "$SAFE_REFERENCE" ]]; then
  SAFE_REFERENCE="snapshot"
fi
ARCHIVE_NAME="${TIMESTAMP}_${SAFE_REFERENCE}.tar.gz"
ARCHIVE_PATH="$VAULT_DIR/$ARCHIVE_NAME"

tar --exclude='./vault' --exclude='./node_modules' --exclude='./.git' -C "$ROOT_DIR" -czf "$ARCHIVE_PATH" .

printf '%s | %s | %s\n' "$TIMESTAMP" "$REFERENCE" "$ARCHIVE_NAME" >> "$VAULT_DIR/manifest.log"

echo "Snapshot saved to $ARCHIVE_PATH"
