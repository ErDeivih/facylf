#!/usr/bin/env bash
# despliega-web-cuando-termine.sh — espera a que acabe la reconstrucción y despliega la web sola
#
# ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
#
# Reconstruir la imagen de la web tarda entre treinta minutos y varias horas en esta máquina (compila `dominio` e
# `ingesta` con `tsc -b` y luego un Next completo, con dieciséis recolectores machacando los mismos cuatro
# núcleos). Esperar mirando el registro es tiempo perdido, y dejarlo a medias significa que la web siga enseñando
# las tres federaciones que ya no se recogen aquí.
#
# Así que el despliegue queda ENCADENADO al build: este guion espera a que el proceso termine, comprueba que de
# verdad se construyó la imagen (no que el proceso muriera), recrea el contenedor y **verifica mirando el
# contenido de las páginas** que las tres ya no aparecen. Deja el resultado en su registro.
#
# ── POR QUÉ NO SE CORTA POR TIEMPO ───────────────────────────────────────────────────────────────────────
#
# Un límite de tiempo aquí es peor que no tenerlo: si el build tarda más, el despliegue no se haría y nadie se
# enteraría. Se espera mientras el proceso exista, y se avisa en el registro de cada paso.
#
# Uso:  bash scripts/servidor/despliega-web-cuando-termine.sh
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

REGISTRO=/tmp/despliegue-web.log
exec > "$REGISTRO" 2>&1
echo "══ esperando a que termine la reconstrucción · $(date -Is) ══"

# El patrón va DENTRO del fichero a propósito: con `pgrep -f 'docker build …'` escrito en la línea de órdenes de
# `ssh`, el patrón aparece en la propia línea y el `pgrep` se encuentra a sí mismo. Es una regla del traspaso.
minutos=0
while pgrep -f 'docker build -f apps/web/Dockerfile' >/dev/null 2>&1; do
  sleep 60
  minutos=$((minutos + 1))
  [ $((minutos % 15)) -eq 0 ] && echo "  … ${minutos} min esperando (carga: $(cut -d' ' -f1 /proc/loadavg))"
done
echo "── la compilación ha terminado tras ${minutos} min · $(date -Is) ──"

echo
echo "── ¿se construyó la imagen o murió el proceso? ──"
tail -5 /tmp/build-web4.log
if ! grep -q 'naming to docker.io/library/facylf-web:local' /tmp/build-web4.log; then
  echo
  echo "RESULTADO: la imagen NO se construyó. NO se despliega nada (mejor una web vieja que una web rota)."
  echo "Motivo, en las últimas líneas del registro de arriba. Si vuelve a ser"
  echo "'lookup registry-1.docker.io: i/o timeout', es la falta de ruta IPv6 con DNS devolviendo AAAA."
  exit 1
fi
echo "  la imagen se construyó"

echo
echo "── recreando el contenedor de la web con la imagen nueva ──"
docker compose --env-file docker/.env -f docker/web.yml up -d 2>&1 | tail -5

echo
echo "── esperando a que la web responda ──"
for intento in $(seq 1 30); do
  if curl -s -o /dev/null -w '' --max-time 10 http://100.117.58.93:3100/ 2>/dev/null; then
    echo "  responde tras ${intento} intento(s)"; break
  fi
  sleep 5
done

echo
echo "══ VERIFICACIÓN: que las tres ya no se puedan consultar ══"
bash scripts/servidor/trae-paginas-web.sh /tmp/web-verif-final >/dev/null 2>&1 || true
for pagina in portada federaciones; do
  fichero="/tmp/web-verif-final/${pagina}.html"
  [ -f "$fichero" ] || { echo "  ${pagina}: no se pudo traer"; continue; }
  echo "  ${pagina}.html ($(wc -c < "$fichero") bytes)"
  for nombre in 'Comunidad Valenciana' 'Comunidad de Madrid' 'Cataluña'; do
    n=$(grep -c "$nombre" "$fichero" 2>/dev/null || true)
    echo "     ${nombre}: ${n:-0} apariciones (debe ser 0)"
  done
  # Y que las otras SÍ estén: si no aparece ninguna, el filtro se ha pasado de frenada.
  echo "     control (Andalucía, debe ser >0): $(grep -c 'Andalucía' "$fichero" 2>/dev/null || echo 0)"
done

echo
echo "══ fin · $(date -Is) ══"
