#!/bin/bash
export PATH="/home/sergio-alvarado/.nvm/versions/node/v22.23.2/bin:$PATH"
# Regenera picks.json con el analisis (calibracion en cache) y, si el
# contenido cambio de verdad, hace commit + push para que la app lo vea
# via GitHub raw (dataSource: 'static' en la app).
#
# Frecuencia: cada 15 minutos. ESPN es ilimitado por peticion y daily corre en ~3s.
# con cache caliente. 15 min alcanza para ver el marcador y la cuota
# casi en vivo sin gastar de mas: ESPN mueve lineas todo el dia, no por minuto.
set -euo pipefail

DIR="/home/sergio-alvarado/Proyectos/mispronosticos-clone"
LOG="$DIR/server/db/publicar.log"

cd "$DIR"

echo "=== $(date -Is) inicio ===" >> "$LOG"

# 1) Regenerar picks. En silencio salvo error.
if ! timeout 900 node server/scripts/daily.mjs >> "$LOG" 2>&1; then
  echo "$(date -Is) daily FALLO (ver arriba)" >> "$LOG"
  exit 0  # no romper la cadena en un fallo puntual; se reintenta al proximo tick
fi

# 2) Publicar solo si hubo cambio material (huella sin timestamp).
if ! node server/scripts/publicar-si-cambia.mjs >> "$LOG" 2>&1; then
  echo "$(date -Is) sin cambios materiales, no se publica" >> "$LOG"
  exit 0
fi

# 3) Commit + push.
git add server/public/picks.json server/data/picks-anterior.json
if git commit -m "chore(data): actualizar picks $(date -u +%Y-%m-%dT%H:%MZ)" >> "$LOG" 2>&1; then
  git push origin main >> "$LOG" 2>&1 && echo "$(date -Is) publicado y empujado" >> "$LOG"
else
  echo "$(date -Is) nada que commitear" >> "$LOG"
fi
