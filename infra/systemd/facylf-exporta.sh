#!/usr/bin/env bash
# Genera un lote incremental del canónico cada 15 minutos, listo para enviar al VPS.
#
# El lote NO se marca como exportado hasta que el receptor lo confirma (`--confirmar <id>`), así que si no
# llega al VPS se puede repetir sin perder nada. Se guardan los 20 lotes más recientes.
#
# Instalación en el servidor:
#   sudo cp facylf-exporta.sh /usr/local/bin/ && sudo chmod +x /usr/local/bin/facylf-exporta.sh
#   sudo cp facylf-exporta.service facylf-exporta.timer /etc/systemd/system/
#   sudo systemctl daemon-reload && sudo systemctl enable --now facylf-exporta.timer
set -u
LOG=/var/log/facylf-exporta.log
DIR=/var/lib/facylf-export
mkdir -p "$DIR/lotes"
/usr/local/bin/node /srv/data/facylf/scripts/servidor/exporta-lote.mjs \
  --destino "$DIR/lotes" --estado "$DIR/estado.json" --limite 50000 >>"$LOG" 2>&1
ls -1dt "$DIR"/lotes/*-manifiesto.json 2>/dev/null | tail -n +21 | while read -r f; do
  base="${f%-manifiesto.json}"
  rm -f "$base"-*.csv "$f"
done
