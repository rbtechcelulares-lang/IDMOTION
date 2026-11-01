#!/usr/bin/env bash
# Instala e liga o ID MOTION (Mac/Linux). Uso: ./setup.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "Instale o Node 22: https://nodejs.org"; exit 1; fi
exec node scripts/setup.mjs "$@"
