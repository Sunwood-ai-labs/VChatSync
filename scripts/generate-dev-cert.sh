#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="${BASH_SOURCE%/*}/../certs"
mkdir -p "$CERT_DIR"

CRT="$CERT_DIR/localhost.crt"
KEY="$CERT_DIR/localhost.key"

if [[ -f "$CRT" && -f "$KEY" ]]; then
  echo "Certificates already exist in $CERT_DIR"
  exit 0
fi

openssl req \
  -x509 \
  -nodes \
  -days 365 \
  -newkey rsa:2048 \
  -keyout "$KEY" \
  -out "$CRT" \
  -subj "/C=JP/ST=Tokyo/L=Tokyo/O=VChatSync Dev/OU=Local/CN=localhost"

echo "Generated self-signed certificate:"
echo "  $CRT"
echo "  $KEY"
