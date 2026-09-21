#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿los marcadores de estado crean EQUIPOS DUPLICADOS dentro del mismo grupo?
 *
 * Si la misma plantilla aparece en unas jornadas como «BEASAIN S.D.» y en otras como
 * «(Sailkatua) BEASAIN S.D.», el importador —que deriva club y equipo del literal de la fuente— crea
 * DOS inscripciones para un solo equipo. Eso partiría la plantilla, la clasificación y las
 * estadísticas, y es más grave que el propio bloqueo del lote.
 *
 * Uso: node scripts/_diag-equipos-con-marcador.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sinMarcadores = (n) => String(n ?? '').replace(/\(\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,12}\s*\)/g, ' ').replace(/\s+/g, ' ').trim();

const colas = [];
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const ruta = join(raiz, entrada.name, 'recolector-local', 'cola-v2.sqlite');
  if (existsSync(ruta)) colas.push({ federacion: entrada.name.replace(/^descargas-/, ''), ruta });
}

const marcadores = new Map();
let totalEquipos = 0, conMarcador = 0;
let gruposConDuplicado = 0;
const ejemplos = [];
for (const { federacion, ruta } of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  let equiposConMarcador = 0;
  for (const e of db.prepare('select temporada, codigo, nombre from equipos').all()) {
    totalEquipos++;
    if (!/\([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,12}\)/.test(String(e.nombre))) continue;
    equiposConMarcador++;
    conMarcador++;
    for (const m of String(e.nombre).matchAll(/\(([^)]{1,12})\)/g)) marcadores.set(m[0], (marcadores.get(m[0]) ?? 0) + 1);
  }

  /* ¿La misma plantilla con y sin marcador dentro del MISMO grupo? */
  const porGrupo = new Map();
  for (const p of db.prepare(`select temporada, competicion, grupo, equipo_local_codigo cl, equipo_visitante_codigo cv, local, visitante from partidos`).all()) {
    const clave = `${p.temporada}|${p.competicion}|${p.grupo}`;
    if (!porGrupo.has(clave)) porGrupo.set(clave, new Set());
    const s = porGrupo.get(clave);
    for (const [codigo, nombre] of [[p.cl, p.local], [p.cv, p.visitante]]) {
      if (codigo) s.add(`${codigo}|${normaliza(nombre)}|${normaliza(sinMarcadores(nombre))}`);
    }
  }
  for (const [clave, s] of porGrupo) {
    // Se agrupa por nombre limpio: si un mismo nombre limpio aparece con DOS formas distintas,
    // el grupo tiene el equipo escrito de dos maneras.
    const porLimpio = new Map();
    for (const registro of s) {
      const [, bruto, limpio] = registro.split('|');
      if (!porLimpio.has(limpio)) porLimpio.set(limpio, new Set());
      porLimpio.get(limpio).add(bruto);
    }
    for (const [limpio, brutos] of porLimpio) {
      if (brutos.size > 1) {
        gruposConDuplicado++;
        if (ejemplos.length < 10) ejemplos.push(`${federacion} · ${clave} · «${limpio}» aparece como ${[...brutos].map((b) => `«${b}»`).join(' y ')}`);
        break; // un grupo basta como ejemplo
      }
    }
  }
  if (equiposConMarcador) console.log(`${federacion.padEnd(22)} equipos con marca entre paréntesis: ${equiposConMarcador}`);
  db.close();
}
console.log(`\nequipos en las 18 colas: ${totalEquipos} · con marca entre paréntesis en el nombre: ${conMarcador}`);
console.log(`marcas distintas (top 12):`);
for (const [m, n] of [...marcadores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${m.padEnd(16)} ${n}`);
console.log(`\ngrupos donde el MISMO equipo aparece con dos formas distintas: ${gruposConDuplicado}`);
for (const e of ejemplos) console.log(`  ${e}`);
