#!/bin/bash
# ── ¿QUÉ ESTÁ HACIENDO LA UNIDAD QUE SE ATASCA? ─────────────────────────────────────────────────────────
#
# El importador del servidor se queda a veces más de una hora dentro de UNA unidad, quemando un núcleo entero,
# con **cero consultas activas en PostgreSQL**. Eso no es «va lento»: es que el trabajo se está haciendo en Node,
# en local, y hay que saber si eso es una unidad enorme de verdad o un bucle.
#
# Este guion coge la unidad que está corriendo ahora mismo y la mira por todos lados:
#
#   · cuánto tiempo de reloj y cuánto de PROCESADOR lleva (la diferencia dice si espera o calcina);
#   · si está leyendo del disco (muestras de `/proc/<pid>/io`): una importación real lee la cola; un bucle no;
#   · cómo de grande es esa unidad en la cola —actas, jornadas, partidos—, que es lo que permite decir si una
#     hora de CPU es razonable o absurda;
#   · si ese grupo YA entró en el canónico (filas, edición, grupos) aunque se cuente como fallo;
#   · y por qué se declaró fallo la vez anterior.
#
# SÓLO LEE. No corta nada.
#
# Uso:  bash mira-unidad-atascada.sh
set -u

echo "════════════════════════════════════════════════════════════════════════════════"
echo " 1 · LA UNIDAD QUE ESTÁ CORRIENDO AHORA"
echo "════════════════════════════════════════════════════════════════════════════════"
# OJO con el identificador: `tsx` lanza el proceso de verdad como HIJO, así que el primero que aparece con
# `--federacion` es el lanzador —que está casi parado— y no el que trabaja. Medido el 01/10/2026: el lanzador
# marcaba 00:00:00 de procesador mientras su hijo llevaba 1 h 03 min. Hay que coger el hijo.
linea="$(docker exec facylf-importador ps -eo pid,ppid,etime,time,args 2>/dev/null | grep -- '--federacion' | grep -v 'tsx/dist/cli.mjs' | head -1 || true)"
[ -z "$linea" ] && linea="$(docker exec facylf-importador ps -eo pid,ppid,etime,time,args 2>/dev/null | grep -m1 -- '--federacion' || true)"
if [ -z "$linea" ]; then
  echo "  no hay ninguna unidad corriendo; el importador está entre tandas"
  exit 0
fi
pid="$(echo "$linea" | awk '{print $1}')"
echo "  $linea"
fed="$(echo "$linea" | grep -oE '\-\-federacion [a-z-]+' | awk '{print $2}')"
temp="$(echo "$linea" | grep -oE '\-\-temporada [0-9-]+' | awk '{print $2}')"
grupo="$(echo "$linea" | grep -oE '\-\-grupo [0-9]+' | awk '{print $2}')"
echo
echo "  federación: $fed · temporada: $temp · grupo: $grupo · pid que trabaja: $pid"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 2 · ¿LEE DEL DISCO O GIRA EN EL AIRE? (dos muestras de /proc)"
echo "════════════════════════════════════════════════════════════════════════════════"
# Una importación de verdad lee la cola y el archivo: `read_bytes` sube. Un bucle cerrado no lee nada nuevo y
# sólo suma tiempo de procesador. Es la prueba que separa las dos cosas.
a="$(docker exec facylf-importador cat /proc/$pid/io 2>/dev/null | awk '/read_bytes/ {print $2}')"
ta="$(docker exec facylf-importador cat /proc/$pid/stat 2>/dev/null | awk '{print $14+$15}')"
echo "  ahora  · read_bytes=$a  · ticks de CPU=$ta"
sleep 25
b="$(docker exec facylf-importador cat /proc/$pid/io 2>/dev/null | awk '/read_bytes/ {print $2}')"
tb="$(docker exec facylf-importador cat /proc/$pid/stat 2>/dev/null | awk '{print $14+$15}')"
echo "  en 25s · read_bytes=$b  · ticks de CPU=$tb"
echo "  → lecturas nuevas: $(( (b - a) / 1024 )) KB   ·   procesador: $(( (tb - ta) * 100 / 100 / 25 ))% de un núcleo"
if [ "$b" -le "$a" ] && [ "$tb" -gt "$ta" ]; then
  echo "  ⚠ NO LEE NADA Y SÍ GASTA PROCESADOR: eso es un bucle, no una unidad grande."
fi

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 3 · CÓMO DE GRANDE ES ESA UNIDAD EN LA COLA"
echo "════════════════════════════════════════════════════════════════════════════════"
cola="/srv/ssd/facylf/$fed/cola-v2.sqlite"
[ -f "$cola" ] || cola="/srv/data/facylf/descargas-$fed/recolector-local/cola-v2.sqlite"
if [ -f "$cola" ]; then
  echo "  cola: $cola"
  docker run --rm -e GRUPO="$grupo" -e TEMP="$temp" -v "$cola:/cola.sqlite:ro" node:22-alpine node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync("/cola.sqlite", { readOnly: true });
    const g = process.env.GRUPO, t = process.env.TEMP;
    const actas = db.prepare("select count(*) n from actas where temporada=? and grupo=?").get(t, g).n;
    const hechas = db.prepare("select count(*) n from actas where temporada=? and grupo=? and estado=?").get(t, g, "hecha").n;
    const jornadas = db.prepare("select count(*) n from jornadas where temporada=? and grupo=?").get(t, g).n;
    console.log(`  actas del grupo: ${actas} (hechas ${hechas}) · jornadas descargadas: ${jornadas}`);
    const tam = db.prepare("select count(*) n, sum(length(datos)) b from actas where temporada=? and grupo=? and datos is not null").get(t, g);
    console.log(`  actas con datos analizados: ${tam.n} · JSON total: ${Math.round((tam.b || 0) / 1048576)} MB`);
    db.close();
  ' 2>&1 | grep -v Experimental
else
  echo "  (no encuentro la cola de $fed)"
fi
