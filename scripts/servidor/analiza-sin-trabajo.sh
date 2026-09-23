#!/usr/bin/env bash
# ¿Cuántas veces se queda una federación SIN TRABAJO DISPONIBLE, y por qué?
#
# El análisis de huecos dice que entre un tercio y casi la mitad del reloj se va en espacios de más de un
# minuto. Y el análisis de relevos dice que las sesiones duran 160-220 trabajos y que el supervisor sólo espera
# 20 s: o sea que esos espacios NO son relevos. Ocurren DENTRO de la sesión.
#
# La causa más probable es que no haya NADA que pedir: los trabajos pendientes están aplazados a la fecha en
# que la federación publica (el código aplaza una jornada «a la mañana siguiente del partido»), así que el
# worker sale, el supervisor pregunta cuándo vuelve y se duerme hasta entonces.
#
# Eso cambia por completo la conclusión: ese tiempo no es un fallo que se pueda arreglar optimizando nada, es
# la federación esperando a que publiquen. Distinguirlo es la diferencia entre un diagnóstico y una suposición.
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/analiza-sin-trabajo.sh [federación] [horas]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
FED=${1:-andalucia}
HORAS=${2:-3}
LOG="$RAIZ/descargas-$FED/recolector-local/worker-programado.log"

[ -f "$LOG" ] || { echo "no existe el registro de $FED"; exit 1; }
DESDE=$(date -d "-$HORAS hours" '+%Y-%m-%d %H:%M:%S')

echo "══ $FED · por qué se queda sin pedir (últimas $HORAS h) ══"
echo

# Las líneas del supervisor llevan fecha; las del worker no. Para contar MOTIVOS basta con contar las del
# worker, porque el registro no se rota a cada hora: se acota por la última sesión, que es lo que interesa.
awk -v desde="$DESDE" '
  /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] / { fecha = $1 " " $2 }
  # Sólo se cuentan los motivos de las sesiones que empezaron dentro de la ventana.
  /Arrancando o reanudando la ingesta/ { dentro = (fecha >= desde); next }
  dentro && /Sin trabajo disponible ahora/ { sinTrabajo += 1
    if (match($0, /aplazado a [^ )]*/)) { aplazado = substr($0, RSTART + 11, RLENGTH - 11); ultimo = aplazado } next }
  dentro && /La cola queda intacta para la próxima ejecución/ { pausaOperativa += 1; next }
  dentro && /Presupuesto diario agotado/ { presupuesto += 1; next }
  dentro && /Pausa global preventiva/ { pausaGlobal += 1; next }
  END {
    printf "  veces SIN trabajo disponible:   %d\n", sinTrabajo
    printf "  veces fuera de horario/pausado: %d\n", pausaOperativa
    printf "  veces sin presupuesto diario:   %d\n", presupuesto
    printf "  pausas globales por fallos:     %d\n", pausaGlobal
    if (ultimo != "") printf "  próximo trabajo aplazado a:     %s\n", ultimo
  }
' "$LOG"
echo

echo '── y qué dice la cola AHORA de sus pendientes ──'
docker run --rm -v "$RAIZ:/app" --entrypoint node facylf-recolectores:local -e "
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync('/app/descargas-$FED/recolector-local/cola-v2.sqlite', { readOnly: true });
  const ahora = new Date().toISOString();
  const total = d.prepare(\"select count(*) n from trabajos where estado in ('pendiente','bloqueado')\").get().n;
  const libres = d.prepare(\"select count(*) n from trabajos where estado in ('pendiente','bloqueado') and (siguiente_intento is null or siguiente_intento <= ?)\").get(ahora).n;
  const prox = d.prepare(\"select min(siguiente_intento) t from trabajos where estado='pendiente' and siguiente_intento > ?\").get(ahora).t;
  console.log('  pendientes o bloqueados:            ' + total);
  console.log('  DISPONIBLES en este momento:        ' + libres);
  console.log('  aplazados (no se pueden pedir aún): ' + (total - libres));
  console.log('  el más próximo vuelve a estar listo: ' + (prox ?? '(ninguno)'));
" 2>&1
