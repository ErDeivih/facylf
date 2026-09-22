#!/usr/bin/env bash
# Deja UNA sola copia de seguridad en marcha: corta lo que haya, quita el cerrojo viejo y relanza.
# El nombre de este fichero no coincide con los patrones que se buscan, así que no se mata a sí mismo.
set -uo pipefail

RAIZ=/srv/data/facylf
DESTINO=/srv/data/backups/facylf

echo "── cortando contenedores de copia ──"
for id in $(docker ps -q); do
  cmd=$(docker inspect -f '{{join .Config.Cmd " "}}' "$id" 2>/dev/null)
  case "$cmd" in
    *copia-cola.mjs*) docker kill "$id" >/dev/null 2>&1 && echo "  cortado $id" ;;
  esac
done

echo "── cortando guiones padre ──"
for p in $(pgrep -f 'servidor/copias' 2>/dev/null); do
  kill -9 "$p" 2>/dev/null && echo "  cortado pid $p"
done
sleep 2

echo "── quitando el cerrojo de las ejecuciones muertas ──"
rmdir "$DESTINO/.copia-en-marcha" 2>/dev/null && echo "  cerrojo quitado" || echo "  no había cerrojo"

echo "── relanzando una sola copia ──"
nohup bash "$RAIZ/scripts/servidor/copias.sh" > "$RAIZ/estado/copias.log" 2>&1 &
sleep 15

echo "── comprobación ──"
echo "  guiones en marcha: $(pgrep -fc 'servidor/copias')"
echo "  contenedores de copia: $(for id in $(docker ps -q); do docker inspect -f '{{join .Config.Cmd " "}}' "$id" 2>/dev/null; done | grep -c copia-cola.mjs)"
ls -ld "$DESTINO/.copia-en-marcha" 2>/dev/null | sed 's/^/  cerrojo: /'
tail -3 "$RAIZ/estado/copias.log" | sed 's/^/  /'
