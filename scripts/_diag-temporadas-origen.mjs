/**
 * Diagnóstico de sólo lectura: qué temporadas y cuántos grupos hay en cada cola de origen.
 * Uso: node scripts/_diag-temporadas-origen.mjs [temporada]
 * No escribe nada en las colas (abre en modo readOnly).
 */
import { readdirSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const filtro = process.argv[2] ?? null;
const raiz = process.cwd();
const carpetas = readdirSync(raiz).filter((n) => n.startsWith('descargas-') && !n.includes('sondeo'));

for (const carpeta of carpetas) {
  const ruta = `${carpeta}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const columnas = db.prepare("select name from pragma_table_info('partidos')").all().map((c) => c.name);
    const conActa = columnas.find((c) => /acta|informe/.test(c));
    const filas = db.prepare(`select temporada, count(distinct grupo) grupos, count(*) partidos
        ${conActa ? `, sum(case when ${conActa} is not null then 1 else 0 end) con_acta` : ''}
      from partidos group by temporada order by temporada desc limit 4`).all();
    const deInteres = filtro ? filas.filter((f) => String(f.temporada).includes(filtro)) : filas;
    if (deInteres.length === 0) continue;
    console.log(`${carpeta.replace('descargas-', '')}:`);
    for (const f of deInteres) {
      console.log(`  ${f.temporada}: ${f.grupos} grupos · ${f.partidos} partidos${conActa ? ` · ${f.con_acta} con «${conActa}»` : ''}`);
    }
  } catch (error) {
    console.log(`${carpeta}: ${error.message}`);
  } finally {
    db.close();
  }
}
