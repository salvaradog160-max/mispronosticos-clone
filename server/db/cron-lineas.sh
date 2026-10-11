#!/bin/bash
# Corre el extractor de lineas cada 30 minutos.
#
# Frecuencia elegida por el dato, no por costumbre: la apertura ya esta
# guardada desde la primera lectura y el cierre se rellena solo cuando
# ESPN publica el cierre (al empezar el partido). 30 minutos alcanza para
# no perder ningun cierre sin gastar peticiones de mas.
#
# BetTrack usa 5 minutos, pero paga un proveedor con limite. ESPN es
# ilimitado, asi que se usa una frecuencia que sirva al dato y no al
#تنايغ.
set -euo pipefail

DIR="/home/sergio-alvarado/Proyectos/mispronosticos-clone/server"
LOG="$DIR/db/lineas.log"

cd "$DIR"

# Si Postgres no esta listo (arrancando la maquina), reintenta.
for i in $(seq 1 10); do
  if docker exec lineas-postgres pg_isready -U lineas -d lineas >/dev/null 2>&1; then
    break
  fi
  [ "$i" = "10" ] && { echo "$(date -Is) postgres no responde, se omite esta corrida" >> "$LOG"; exit 0; }
  sleep 10
done

echo "=== $(date -Is) inicio ===" >> "$LOG"
if node db/lineas.mjs >> "$LOG" 2>&1; then
  echo "$(date -Is) ok" >> "$LOG"
else
  echo "$(date -Is) FALLO (ver arriba)" >> "$LOG"
fi