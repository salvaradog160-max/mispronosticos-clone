#!/usr/bin/env bash
# Copia la herramienta de Pronostico de Goles (HTML) al APK: android/app/src/main/assets/herramienta/index.html.
# Correr antes de compilar cuando cambie el HTML. Origen por defecto: ~/Descargas/pronostico-goles (1).html
set -euo pipefail
ORIGEN="${1:-$HOME/Descargas/pronostico-goles (1).html}"
DESTINO="$(dirname "$0")/../android/app/src/main/assets/herramienta/index.html"
mkdir -p "$(dirname "$DESTINO")"
cp "$ORIGEN" "$DESTINO"
echo "Herramienta copiada ($(wc -c < "$DESTINO") bytes) -> $DESTINO"
