#!/usr/bin/env node
/*
 * ── APAGAR Y ENCENDER LA PANTALLA CON UNA TECLA ────────────────────────────────────────────────────────
 *
 * Escucha el teclado de la consola y, al pulsar Scroll Lock o F9, apaga o enciende la pantalla del portátil
 * con el mismo mecanismo de la noche (brillo + DPMS, ver `facylf-pantalla.sh`). Así no hay que cerrar la
 * tapa para dejarla apagada.
 *
 * Por qué estas teclas: F1-F6 cambian de consola y F7-F12 las usan algunos programas; Scroll Lock y F9 no
 * hacen nada en esta máquina, así que quedan libres para esto.
 *
 * El estado no se lleva en memoria: se lee el brillo del panel antes de decidir. Si el panel está a 0, la
 * tecla lo enciende; si está encendido, lo apaga. Así da igual quién lo haya apagado (la tecla o el
 * temporizador de la noche).
 *
 * Formato del evento del kernel en x86_64: 16 bytes de marca de tiempo + u16 tipo + u16 código + s32 valor.
 * Sólo interesan los eventos de tecla (tipo 1) con valor 1 (pulsación, no repetición ni suelta).
 */
import { openSync, readSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const TECLADO = '/dev/input/by-path/platform-i8042-serio-0-event-kbd';
const BRILLO = '/sys/class/backlight/intel_backlight/brightness';
const SCRIPT = '/usr/local/bin/facylf-pantalla.sh';
// 70 = Scroll Lock, 67 = F9.
const TECLAS = new Set([70, 67]);

function pantallaApagada() {
  try {
    return Number(readFileSync(BRILLO, 'utf8').trim()) === 0;
  } catch {
    return false;
  }
}

function main() {
  const fd = openSync(TECLADO, 'r');
  const evento = Buffer.alloc(24);
  console.log(`escuchando ${TECLADO}; teclas: Scroll Lock y F9`);
  for (;;) {
    readSync(fd, evento, 0, 24, null);
    const tipo = evento.readUInt16LE(16);
    const codigo = evento.readUInt16LE(18);
    const valor = evento.readInt32LE(20);
    if (tipo !== 1 || valor !== 1 || !TECLAS.has(codigo)) continue;
    const apagada = pantallaApagada();
    try {
      execFileSync(SCRIPT, [apagada ? 'on' : 'off'], { stdio: 'ignore' });
      console.log(`${new Date().toISOString()} tecla ${codigo}: pantalla ${apagada ? 'encendida' : 'apagada'}`);
    } catch (error) {
      console.error(`no se pudo cambiar la pantalla: ${error.message}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
