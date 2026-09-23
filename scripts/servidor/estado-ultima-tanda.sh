#!/usr/bin/env bash
# ── ESTADO ACTUAL: ¿cómo terminó la ÚLTIMA tanda de cada federación? ─────────────────────────────────────
#
# Un `tail` largo mezcla lo que pasó hace horas con lo que pasa ahora, y así se confunden incidentes ya
# resueltos con averías vivas. Esto mira SÓLO el último arranque y su último código de salida, con su hora.
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/estado-ultima-tanda.sh
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
ahora=$(date +%s)

echo '════ ÚLTIMA TANDA DE CADA FEDERACIÓN ════'
printf '  %-22s %-20s %-10s %s\n' federación "último arranque" "código" "hace"

for f in "$RAIZ"/descargas-*/recolector-local/worker-programado.log; do
  [ -f "$f" ] || continue
  fed=${f#*/descargas-}
  fed=${fed%%/*}
  case "$fed" in prueba*|*-sondeo) continue ;; esac

  ultimo_arranque=$(grep 'Arrancando o reanudando la ingesta' "$f" 2>/dev/null | tail -1 | cut -c1-19)
  ultimo_codigo=$(grep 'El worker termino con codigo' "$f" 2>/dev/null | tail -1)
  # El código de salida sale de «...termino con codigo N;».
  cod=$(printf '%s' "$ultimo_codigo" | sed -n 's/.*termino con codigo \([0-9-]*\).*/\1/p')

  # ── ¿ESTÁ VIVO O HA MUERTO? ─────────────────────────────────────────────────────────────────────────────
  #
  # Mirar sólo «el último código» engaña: si el proceso está trabajando AHORA, su última línea de salida es de
  # una tanda ANTERIOR y se marcaría como avería una federación que está recolectando bien. Pasó el
  # 23/09/2026 con Valencia: la marca salió en rojo teniendo el worker funcionando. Lo que decide es el ORDEN:
  # si el último arranque es POSTERIOR al último cierre, el worker está vivo.
  linea_arranque=$(grep -n 'Arrancando o reanudando la ingesta' "$f" 2>/dev/null | tail -1 | cut -d: -f1)
  linea_cierre=$(grep -n 'El worker termino con codigo' "$f" 2>/dev/null | tail -1 | cut -d: -f1)
  vivo=''
  if [ -n "$linea_arranque" ] && [ -n "$linea_cierre" ] && [ "$linea_arranque" -gt "$linea_cierre" ]; then
    vivo='sí'
  fi

  # ¿Cuándo fue? Se convierte la marca de tiempo del registro a segundos.
  cuando=''
  if [ -n "$ultimo_arranque" ]; then
    t=$(date -d "$ultimo_arranque" +%s 2>/dev/null || echo '')
    [ -n "$t" ] && cuando="$(( (ahora - t) / 60 )) min"
  fi

  aviso=''
  if [ "$vivo" != 'sí' ] && [ -n "$cod" ] && [ "$cod" != "0" ]; then
    aviso='  ← LA ÚLTIMA TANDA FALLÓ Y NO HAY OTRA EN CURSO'
  elif [ "$vivo" = 'sí' ]; then
    aviso='  (trabajando ahora)'
  fi
  printf '  %-22s %-20s %-10s %s%s\n' "$fed" "${ultimo_arranque:-—}" "${cod:-—}" "$cuando" "$aviso"
done

echo
echo '── el último error de cada federación que esté CAÍDA (no de las que trabajan ahora) ──'
for f in "$RAIZ"/descargas-*/recolector-local/worker-programado.log; do
  [ -f "$f" ] || continue
  fed=${f#*/descargas-}; fed=${fed%%/*}
  case "$fed" in prueba*|*-sondeo) continue ;; esac
  linea_arranque=$(grep -n 'Arrancando o reanudando la ingesta' "$f" 2>/dev/null | tail -1 | cut -d: -f1)
  linea_cierre=$(grep -n 'El worker termino con codigo' "$f" 2>/dev/null | tail -1 | cut -d: -f1)
  cod=$(printf '%s' "$(grep 'El worker termino con codigo' "$f" 2>/dev/null | tail -1)" \
    | sed -n 's/.*termino con codigo \([0-9-]*\).*/\1/p')
  if [ -n "$linea_arranque" ] && [ -n "$linea_cierre" ] && [ "$linea_arranque" -gt "$linea_cierre" ]; then
    continue   # está trabajando: su último cierre es cosa del pasado
  fi
  if [ -n "$cod" ] && [ "$cod" != "0" ]; then
    echo "  ── $fed (código $cod) ──"
    grep -E '^Error|^ *Error:|Error:' "$f" 2>/dev/null | tail -1 | sed 's/^/    /'
  fi
done
