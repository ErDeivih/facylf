#!/usr/bin/env bash
# ── MÁS CPU PARA EL IMPORTADOR CUANDO HAY CONTIENDA (propuesta del 01/10/2026; lo lanza David) ─────────────────
# El servidor va a carga ~14 con 4 núcleos (5 Chrome de recolectores). El importador tiene `cpu_shares: 256`
# (la cuarta parte que un contenedor normal) y tope de 1 CPU: con contienda recibe muy poco y un grupo de
# Andalucía tarda 35-40 min. Subir sus `cpu_shares` a 1024 NO le quita el tope de 1 CPU ni cambia el ritmo de
# ningún recolector: sólo hace que, cuando todos quieren CPU, el importador no quede el último.
# Efecto inmediato y sin reiniciar. Para que sobreviva a recrear el contenedor: `cpu_shares: 1024` en
# docker/importador.yml.
set -uo pipefail
echo "antes:   $(docker inspect -f 'cpu_shares={{.HostConfig.CpuShares}} nano_cpus={{.HostConfig.NanoCpus}}' facylf-importador)"
docker update --cpu-shares 1024 facylf-importador >/dev/null
echo "después: $(docker inspect -f 'cpu_shares={{.HostConfig.CpuShares}} nano_cpus={{.HostConfig.NanoCpus}}' facylf-importador)"
