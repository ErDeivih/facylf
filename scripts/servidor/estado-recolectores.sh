#!/usr/bin/env bash
# ── ESTADO DE CADA RECOLECTOR DEL SERVIDOR, CON LA PRUEBA QUE IMPORTA ──────────────────────────────────
#
# Mira, para cada federación: si el contenedor está en marcha y desde cuándo, cuándo se tocó su cola, si tiene
# ficheros de diario (`-wal`/`-shm`), qué dicen las últimas líneas de su registro y si está PIDIENDO de verdad
# (líneas nuevas en los últimos minutos). Un recolector cuya cola está ilegible lo dice en su registro con
# «database disk image is malformed» y se cae; uno sano encadena peticiones.
#
# Es la comprobación barata y suficiente: no abre las 19 bases a la vez (eso, con la flota dentro, cuesta más
# que recolectar), se fía de lo que el propio recolector ya está diciendo. Para la comprobación pesada de
# SQLite está `verifica-integridad-colas.sh`.
#
# Uso:  bash scripts/servidor/estado-recolectores.sh [minutos]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
MINUTOS=${1:-10}
FEDERACIONES=(andalucia aragon asturias baleares canarias cantabria castilla-la-mancha cataluna \
  ceuta euskadi extremadura federacion galicia madrid melilla murcia navarra rioja valencia)

printf '%-22s %-9s %-19s %-17s %-9s %s\n' federación contenedor cola_escrita registro_escrito diarios veredicto
pidiendo=0; caidos=0; esperando=0
for f in "${FEDERACIONES[@]}"; do
  c="facylf-$f-1"
  carpeta="$RAIZ/descargas-$f/recolector-local"
  cola="$carpeta/cola-v2.sqlite"
  registro="$carpeta/worker-programado.log"

  estado=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo 'no existe')
  [ "$estado" = "running" ] && estado="en marcha"
  escrito_cola=$( [ -f "$cola" ] && date -r "$cola" '+%F %H:%M:%S' || echo '—' )
  escrito_reg=$( [ -f "$registro" ] && date -r "$registro" '+%F %H:%M:%S' || echo '—' )
  diarios=""
  for s in '-wal' '-shm'; do [ -f "$cola$s" ] && diarios="$diarios$s "; done
  [ -z "$diarios" ] && diarios='—'

  # El veredicto sale del propio registro: es lo que el recolector ya ha averiguado por nosotros.
  veredicto='?'
  if [ ! -f "$registro" ]; then
    veredicto='sin registro'
  elif grep -q 'database disk image is malformed' "$registro" && \
       [ "$(grep -c 'database disk image is malformed' "$registro")" -gt 0 ] && \
       [ "$(grep -c 'Arrancando o reanudando' "$registro")" -le "$(grep -c 'termi[nó] con c[oó]digo 1' "$registro")" ]; then
    veredicto='COLA ILEGIBLE'
    caidos=$((caidos + 1))
  elif [ -f "$registro" ] && [ -n "$(find "$registro" -mmin -"$MINUTOS" 2>/dev/null)" ]; then
    if grep -qE 'plaza|espera|turno' "$registro" && ! grep -qE '✓|→' "$(ls -t "$registro")" ; then
      veredicto="últimas líneas sin petición"; esperando=$((esperando + 1))
    else
      veredicto='pidiendo'; pidiendo=$((pidiendo + 1))
    fi
  else
    veredicto="sin escribir en $MINUTOS min"
    esperando=$((esperando + 1))
  fi

  printf '%-22s %-9s %-19s %-17s %-9s %s\n' "$f" "$estado" "$escrito_cola" "$escrito_reg" "$diarios" "$veredicto"
done

echo
echo "pidiendo: $pidiendo · sin escribir en $MINUTOS min: $esperando · con la cola ilegible: $caidos"
echo
echo "── fallos recientes de cada federación ──"
# OJO: el registro de un recolector es ACUMULATIVO. Buscar «Error» en todo el fichero saca fallos de ayer ya
# resueltos y hace parecer que algo va mal cuando no (medido el 22/09/2026: el informe listaba el `malformed`
# de Valencia de por la mañana como si fuese de ahora). Se miran sólo las últimas 400 líneas, que en un registro
# que avanza cubren de sobra la ventana de minutos.
for f in "${FEDERACIONES[@]}"; do
  registro="$RAIZ/descargas-$f/recolector-local/worker-programado.log"
  [ -f "$registro" ] || continue
  ultimo=$(tail -400 "$registro" 2>/dev/null | grep -E 'Error|error|malformed|ENOENT|codigo [1-9]' | tail -1)
  [ -n "$ultimo" ] && printf '  %-22s %s\n' "$f" "${ultimo:0:110}"
done
