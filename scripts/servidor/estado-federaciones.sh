#!/usr/bin/env bash
# ── ESTADO DE LAS FEDERACIONES EN UNA LÍNEA CADA UNA ────────────────────────────────────────────────────
#
# Una federación por línea: cuántos partidos hay en la base canónica, cuándo escribió por última vez su
# recolector y si su contenedor está arriba. Sirve para responder «¿está ingiriendo todo el mundo?» de un
# vistazo, sin abrir seis herramientas.
#
#   ssh david@servidor.local 'bash /srv/data/facylf/scripts/servidor/estado-federaciones.sh'
#
# «Última ingesta» es la marca de tiempo del registro del supervisor (`worker-programado.log`): se escribe en
# cada vuelta del worker, así que dice cuándo trabajó de verdad, no cuándo se levantó el contenedor. Un
# contenedor «arriba» con la última ingesta de hace horas está atascado, y eso se ve en la columna.
#
# ── LAS DOS EXCEPCIONES DE NOMBRE (no son un capricho) ─────────────────────────────────────────────────
#
#   · Castilla y León NO tiene perfil ni carpeta propia: es el recolector original (RFCYLF), su código en el
#     canónico es `castilla-leon` y su cola vive en `descargas-federacion`. Su contenedor se llama
#     `facylf-federacion-1` porque el servicio del compose también se llama `federacion`.
#   · Las provinciales (bizkaia, gipuzkoa, araba, laspalmas, tenerife) no tienen contenedor propio: se
#     recogen dentro de su autonómica, así que salen como «sin contenedor propio» con sus filas.
#
# Sólo lee: no arranca, no para y no escribe nada.
set -uo pipefail

RAIZ="${FACYLF_RAIZ:-/srv/data/facylf}"
PG_CONTENEDOR="${FACYLF_PG_CONTENEDOR:-facylf-postgres}"
PG_USUARIO="${FACYLF_PG_USUARIO:-facylf_admin}"
PG_BASE="${FACYLF_PG_BASE:-facylf}"
AVISO_MIN="${FACYLF_AVISO_MIN:-90}"   # a partir de aquí, la ingesta se marca como vieja
ATASCO_MIN="${FACYLF_ATASCO_MIN:-10}" # contenedor ARRIBA con la ingesta parada más de esto = atascado
DISCO_UMBRAL="${FACYLF_DISCO_UMBRAL:-85}" # % de uso a partir del cual se avisa (el SSD del sistema llegó al 94 %)

# ── LAS FILAS SE CUENTAN EN LA BASE CANÓNICA, NO EN LAS COLAS ──────────────────────────────────────────
#
# La cola SQLite dice lo que falta; la base dice lo que ya hay. Lo que se pregunta aquí es lo segundo, y el
# camino es match → phase_group → competition_edition → federation (match no lleva federation_id).
consulta="
select f.codigo, count(*) as partidos
  from core.match m
  join core.phase_group pg        on pg.id = m.phase_group_id
  join core.competition_edition ce on ce.id = pg.competition_edition_id
  join core.federation f          on f.id = ce.federation_id
 where f.codigo not like 'pruebas%'
 group by f.codigo
 order by 2 desc"

mapa_filas="$(docker exec "$PG_CONTENEDOR" psql -U "$PG_USUARIO" -d "$PG_BASE" -At -F'|' -P pager=off -c "$consulta" 2>/dev/null)"
if [ -z "$mapa_filas" ]; then
  echo "No se pudo leer la base ($PG_BASE en $PG_CONTENEDOR). ¿Está el contenedor arriba?" >&2
  exit 1
fi

# ── CONTENEDOR Y CARPETA DE CADA UNA ──────────────────────────────────────────────────────────────────
contenedor_de() {  # $1 = codigo canónico
  case "$1" in
    castilla-leon) echo "facylf-federacion-1" ;;
    bizkaia|gipuzkoa|araba|laspalmas|tenerife) echo "" ;;
    *) echo "facylf-$1-1" ;;
  esac
}
carpeta_de() {     # $1 = codigo canónico
  case "$1" in
    castilla-leon) echo "descargas-federacion" ;;
    *) echo "descargas-$1" ;;
  esac
}

# Los contenedores se leen de una vez: evita una llamada a Docker por federación.
estado_contenedores="$(docker ps -a --format '{{.Names}}|{{.State}}' 2>/dev/null)"

linea_contendor() {  # $1 = nombre del contenedor → "arriba"/"parado"/"no existe"
  local nombre="$1" par
  [ -z "$nombre" ] && { echo "sin contenedor propio"; return; }
  par="$(printf '%s\n' "$estado_contenedores" | awk -F'|' -v n="$nombre" '$1==n {print $2; exit}')"
  case "$par" in
    running) echo "arriba" ;;
    exited)  echo "parado" ;;
    created) echo "creado" ;;
    "")      echo "no existe" ;;
    *)       echo "$par" ;;
  esac
}

# ── ÚLTIMA INGESTA: la marca del registro del supervisor ───────────────────────────────────────────────
# Se usa el mtime del registro y, si no existe, el de la cola (el worker escribe en ambos). Es más fiable que
# parsear la última línea: el registro puede acabar en una línea de error sin fecha.
ultima_ingesta() {  # $1 = carpeta → epoch
  local carpeta="$1" log cola
  log="$RAIZ/$carpeta/recolector-local/worker-programado.log"
  cola="$RAIZ/$carpeta/recolector-local/cola-v2.sqlite"
  if [ -f "$log" ]; then stat -c %Y "$log" 2>/dev/null && return; fi
  if [ -f "$cola" ]; then stat -c %Y "$cola" 2>/dev/null && return; fi
  echo 0
}

# ── SALIDA ─────────────────────────────────────────────────────────────────────────────────────────────
# Los números con punto de millar español (1.234.567) y la antigüedad en texto («hace 3 min»). El ancho se
# calcula con printf, no con tabuladores: así se lee igual en el terminal del servidor y por SSH.
#
# El punto de millar se pone a mano y no con `printf "%'d"`: eso depende de la configuración regional y el
# servidor arranca en C, donde salen los números pelados.
miles() {
  local n="$1" salida=""
  [ -z "$n" ] && { echo 0; return; }
  while [ "${#n}" -gt 3 ]; do salida=".${n: -3}$salida"; n="${n:0:${#n}-3}"; done
  printf '%s%s' "$n" "$salida"
}
printf 'ESTADO FACYLF · %s · %s\n' "$(date '+%Y-%m-%d %H:%M')" "$(hostname 2>/dev/null || echo servidor)"
printf '%-20s %-30s %12s  %-16s %s\n' 'federación' 'contenedor' 'partidos' 'última ingesta' 'estado'
printf '%-20s %-30s %12s  %-16s %s\n' '──────────' '──────────' '────────' '──────────────' '──────'

total=0; arriba=0; ingiriendo=0; atascados=0; ahora="$(date +%s)"
while IFS='|' read -r codigo partidos; do
  [ -z "${codigo:-}" ] && continue
  contenedor="$(contenedor_de "$codigo")"
  carpeta="$(carpeta_de "$codigo")"
  estado="$(linea_contendor "$contenedor")"
  marca="$(ultima_ingesta "$carpeta")"
  if [ "${marca:-0}" -gt 0 ]; then
    edad=$(( (ahora - marca) / 60 ))
    if [ "$edad" -lt 2 ]; then cuando="ahora mismo"
    elif [ "$edad" -lt 60 ]; then cuando="hace ${edad} min"
    else cuando="hace $((edad / 60)) h"; fi
  else
    edad=999999; cuando="sin registro"
  fi
  # «Ingiriendo» = escritura reciente, sin mirar el contenedor: un supervisor dentro de su tanda no escribe
  # hasta que termina, y la pregunta es «¿hay ingesta viva?». El contenedor se cuenta aparte.
  if [ "$edad" -le "$AVISO_MIN" ]; then ingiriendo=$((ingiriendo + 1)); fi
  # ── EL ATASCO QUE NADIE VE (16/11/2026) ─────────────────────────────────────────────────────────────
  # Un contenedor puede estar «arriba» con CPU a cero durante horas: pasó hoy, con los recolectores
  # esperando un DNS que no resolvía. Si está arriba y no escribe desde hace más de ATASCO_MIN, se avisa.
  # Se cuenta «arriba» ANTES de adornar la columna: si no, el marcado dejaba de sumar en el total.
  [ "$estado" = "arriba" ] && arriba=$((arriba + 1))
  # ── ESPERAR PLAZA NO ES ESTAR ATASCADO ───────────────────────────────────────────────────────────────
  # Con 15 federaciones y 2 plazas compartidas, la mayoría espera su turno la mayor parte del tiempo: eso
  # es el diseño, no una avería. Se distingue leyendo la última línea del registro: si dice que espera
  # Chrome, es turno; si no, es atasco de verdad (pasó el 16/11 con el DNS roto).
  if [ "$estado" = "arriba" ] && [ "$edad" -gt "$ATASCO_MIN" ]; then
    ultima="$(tail -n 1 "$RAIZ/$(carpeta_de "$codigo")/recolector-local/worker-programado.log" 2>/dev/null)"
    case "$ultima" in
      *"esperando para abrir Chrome"*) estado="$estado (espera plaza)" ;;
      *) atascados=$((atascados + 1)); estado="$estado ⚠ sin ingesta" ;;
    esac
  fi
  total=$((total + partidos))
  printf '%-20s %-30s %12s  %-16s %s\n' "$codigo" "${contenedor:-sin contenedor}" "$(miles "$partidos")" "$cuando" "$estado"
done <<< "$mapa_filas"

printf '\n'
printf 'TOTAL: %s partidos · %s federaciones · %s contenedores arriba · %s con ingesta en los últimos %s min\n' \
  "$(miles "$total")" "$(grep -c '|' <<< "$mapa_filas")" "$arriba" "$ingiriendo" "$AVISO_MIN"
# El aviso va SIEMPRE, también cuando no hay ninguno: un cero explícito se lee y se vigila.
# ── EL DISCO TAMBIÉN SE AVISA (16/11/2026) ─────────────────────────────────────────────────────────────
# El disco del sistema llegó al 94 % y ahí viven Docker y las colas del SSD. Un contenedor no puede
# «quedarse sin almacenamiento» por sí solo si el disco revienta para todos, así que se avisa por punto de
# montaje. Se puede silenciar con FACYLF_DISCO_UMBRAL=101.
for punto in / /srv/data; do
  uso="$(df -P "$punto" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')"
  [ -n "$uso" ] || continue
  if [ "$uso" -ge "$DISCO_UMBRAL" ]; then
    printf 'AVISO: disco %s al %s %% (umbral %s %%)\n' "$punto" "$uso" "$DISCO_UMBRAL"
  fi
done

if [ "$atascados" -gt 0 ]; then
  printf 'AVISO: %s recolector(es) arriba ATASCADOS (sin ingesta y sin esperar plaza) más de %s min\n' "$atascados" "$ATASCO_MIN"
else
  printf 'AVISO: ninguno atascado (los que no escriben están esperando plaza)\n'
fi
