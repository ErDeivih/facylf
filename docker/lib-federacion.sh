#!/usr/bin/env bash
# ── NOMBRES DE LAS FEDERACIONES EN EL RECOLECTOR ────────────────────────────────────────────────────────
#
# Una federación tiene tres nombres que NO coinciden, y confundirlos rompe el recolector:
#
#   1. **El slug de la cola** — lo que se le pasa al guion (`castilla-la-mancha`, `federacion`).
#   2. **La carpeta** — `descargas-<algo>`. Casi siempre es el slug, pero Castilla y León vive en
#      `descargas-federacion` porque su recolector es el original y nunca tuvo perfil.
#   3. **El código canónico** — lo que hay en `core.federation` (`castilla-leon`, sin la «y»).
#
# Aquí se resuelven (1) → (2) y se dice quién va sin `--perfil`. Es lo único que hay que tocar para que
# `castilla-y-leon` funcione: se acepta como nombre del MISMO recolector de Castilla y León (misma cola,
# misma carpeta), para que el slug exista sin crear un segundo worker sobre el mismo portal.
#
# Este fichero se puede cargar (`source`) para probarlo sin arrancar nada.

# ¿Qué carpeta de descargas usa esta federación? (sin el prefijo `descargas-`)
carpeta_de_federacion() {
  case "${1:-}" in
    castilla-y-leon|castilla-leon|federacion) echo "federacion" ;;
    *) echo "${1:-}" ;;
  esac
}

# ¿Va sin `--perfil`? Castilla y León (con sus dos nombres) es el recolector original; Madrid, Valencia y
# Cataluña tienen su propio guion, que tampoco lee perfil.
federacion_sin_perfil() {
  case "${1:-}" in
    castilla-y-leon|castilla-leon|federacion|madrid|valencia|cataluna) echo 1 ;;
    *) echo 0 ;;
  esac
}

# El código canónico (el de `core.federation`), para los mensajes y los registros.
codigo_canonico_de_federacion() {
  case "${1:-}" in
    castilla-y-leon|federacion) echo "castilla-leon" ;;
    *) echo "${1:-}" ;;
  esac
}
