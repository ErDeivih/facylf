#!/usr/bin/env bash
# ── Actualiza el repositorio de facylf EN EL SERVIDOR ──────────────────────────────────────────────────────
#
# Tres cosas que resuelve, todas aprendidas desplegando:
#
#   1. **Sin DNS no se puede tirar de GitHub** (medido el 21/09/2026). Se acepta un **paquete git** por
#      parámetro (`git bundle` hecho en el PC): es como se actualiza el servidor mientras su DNS esté roto.
#   2. **Los ficheros que se sobrescribieron a mano durante el despliegue** bloquean la fusión. Se restauran
#      antes de traer el commit: lo que se sobrescribió **ya está en ese commit**, así que no se pierde nada.
#   3. **Lo que NO se toca nunca**: `docker/.env` y los datos (`descargas-*`, `estado/`), que no están
#      versionados y son la configuración y el trabajo reales de esta máquina.
#
# Uso:  bash scripts/servidor/actualizar-repo.sh [raiz] [paquete.git]
set -uo pipefail

RAIZ="${1:-/srv/data/facylf}"
PAQUETE="${2:-}"

cd "$RAIZ" || { echo "no existe $RAIZ"; exit 1; }

echo "── antes ──"
git status --short | head -10

# Si hay cambios locales (ficheros que se sobrescribieron a mano durante el despliegue) se apartan en un `stash`:
# su contenido YA está en el commit que se trae, así que no se pierde nada, y así la fusión no se niega a
# seguir. Se deja anotado el stash por si alguien quiere mirarlo.
SUCIO="$(git status --porcelain | head -1)"
if [ -n "$SUCIO" ]; then
  git stash push --include-untracked --quiet --message "despliegue $(date '+%F %H:%M')" \
    && echo "  cambios locales apartados en un stash (su contenido está en el commit que se trae)"
fi

echo "── actualizando ──"
if [ -n "$PAQUETE" ] && [ -f "$PAQUETE" ]; then
  git pull --quiet "$PAQUETE" main && echo "  actualizado desde el paquete $PAQUETE"
elif getent hosts github.com >/dev/null 2>&1; then
  git pull --quiet origin main && echo "  actualizado desde GitHub"
else
  echo "  sin DNS y sin paquete: no se puede actualizar (mira docker/servidor/LEEME.md)"
fi

echo "── después ──"
echo "  commit: $(git log --oneline -1)"
echo "  ficheros versionados: $(git ls-files | wc -l)"
echo "  ficheros modificados sin commitear: $(git status --porcelain --untracked-files=no | wc -l)"
