#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "== 1. Login en Firebase (abre el navegador) =="
firebase login

echo
echo "== 2. Proyectos visibles con tu cuenta =="
firebase projects:list

echo
echo "Si ya creaste el proyecto, descarga el google-services.json:"
echo "  https://console.firebase.google.com/project/_/settings/serviceaccounts"
echo "  (o en el apartado 'General > Tus apps > Android > google-services.json')"
echo
echo "Colócalo en:"
echo "  $(pwd)/MisPronosticosClone/android/app/google-services.json"
echo
echo "== 3. Remote Config: publica los parámetros que el bundle original esconde =="
cat <<'RC'
  En console.firebase.google.com > Remote Config >新建 parámetros:

  api_base_url          (String)  https://TU-BACKEND
  live_socket_url       (String)  https://TU-SOCKET
  min_confidence_top_ai (Number)  78
  min_stars_top_ai      (Number)  4
  trial_days            (Number)  2
RC

echo
echo "== 4. Rebuild =="
cd MisPronosticosClone/android
./gradlew assembleDebug
echo
echo "Listo. Sin el google-services.json la app corre igual con el repositorio mock."