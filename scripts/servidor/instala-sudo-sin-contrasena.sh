#!/usr/bin/env bash
# ── DEJA A `david` USAR `sudo` SIN CONTRASEÑA ────────────────────────────────────────────────────────────
#
# Se ejecuta COMO ROOT (`sudo bash esta-script`) y deja un fichero en `/etc/sudoers.d/`. A partir de ahí, el
# agente puede hacer lo que necesita sin que nadie escriba la contraseña cada vez: arreglar el DNS del host,
# reconstruir la imagen del recolector y poner el tope de memoria de la flota.
#
# Se comprueba el fichero con `visudo -c` ANTES de dejarlo puesto: un `/etc/sudoers.d/` roto deja el `sudo`
# inservible, y eso en un servidor al que sólo se entra por SSH es un problema serio.
#
# Para revocarlo:  sudo rm /etc/sudoers.d/facylf
set -uo pipefail

DESTINO=/etc/sudoers.d/facylf
USUARIO_OBJETIVO=${1:-david}

[ "$(id -u)" = "0" ] || { echo "hay que ejecutarlo como root"; exit 1; }

echo "── antes ──"
ls -la /etc/sudoers.d/ | sed 's/^/  /'

TEMPORAL=$(mktemp)
printf '# Permiso sin contraseña para el agente que despliega facylf (puesto el %s).\n' "$(date '+%F %T')" > "$TEMPORAL"
printf '# Para revocarlo:  sudo rm %s\n' "$DESTINO" >> "$TEMPORAL"
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$USUARIO_OBJETIVO" >> "$TEMPORAL"

echo "── contenido que se va a instalar ──"
sed 's/^/  /' "$TEMPORAL"

# `visudo -c` valida el fichero y su sintaxis antes de que sustituya a nada.
if visudo -c -f "$TEMPORAL" >/dev/null 2>&1; then
  echo "  sintaxis correcta"
else
  echo "  SINTAXIS INCORRECTA: no se instala nada"
  visudo -c -f "$TEMPORAL"
  rm -f "$TEMPORAL"
  exit 1
fi

install -m 0440 -o root -g root "$TEMPORAL" "$DESTINO" && echo "  instalado en $DESTINO"
rm -f "$TEMPORAL"

echo "── después ──"
ls -la /etc/sudoers.d/ | sed 's/^/  /'
echo
echo "comprobación (como el propio usuario):"
if su -s /bin/bash "$USUARIO_OBJETIVO" -c 'sudo -n true' 2>/dev/null; then
  echo "  sudo sin contraseña: FUNCIONA"
else
  echo "  sudo sin contraseña: no funciona todavía"
  exit 1
fi
