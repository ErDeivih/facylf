/*
 * ── LA COMPROBACIÓN QUE DE VERDAD SEPARA UN HUECO DE UN «NO HAY NADA» ────────────────────────────────────
 *
 * La primera comprobación que escribí contaba temporadas del catálogo contra el `desdeAnio` de la
 * configuración. **Daba falsas alarmas**: señaló a Cataluña como si le faltaran diez temporadas cuando su API
 * sólo publica dos (`https://www.fcf.cat/api/competition/temporadas` → 22 y 21, comprobado con una petición).
 *
 * La buena pregunta no es «¿cuántas temporadas hay?», sino **«¿cuántas competiciones hay DENTRO de cada
 * temporada?»**:
 *
 *   · 0 competiciones  → o la fuente no publica esa temporada, o el descubrimiento se quedó a medias.
 *                        **Hay que mirarlo.** Es la firma de Melilla 11-15 (un `catalogo_temporada` hecho y
 *                        cero competiciones) y la de la Cataluña que sí tenía historial.
 *   · algunas          → la temporada se descubrió bien; lo que le falte es recolección, que es otra cosa y ya
 *                        se mide con el aparcado, los pendientes y las actas.
 *
 * Una temporada con 0 competiciones es **invisible** en cualquier resumen de ritmo: no tiene trabajo, así que
 * no pide nada, así que parece «al día».
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/diagnostica-temporadas-vacias.mjs <cola.sqlite> <etiqueta>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, etiqueta] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) { console.log(JSON.stringify({ federacion: etiqueta ?? ruta, error: 'sin cola' })); process.exit(0); }
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
try {
  const temporadas = db.prepare('select codigo, etiqueta from temporadas order by cast(codigo as integer)').all();
  const porTemp = new Map(db.prepare('select temporada, count(*) n from competiciones group by 1').all()
    .map((c) => [String(c.temporada), Number(c.n)]));
  const vacias = [];
  for (const t of temporadas) {
    if ((porTemp.get(String(t.codigo)) ?? 0) === 0) vacias.push(t.etiqueta);
  }
  console.log(JSON.stringify({
    federacion: etiqueta ?? ruta,
    temporadas: temporadas.length,
    conCompeticiones: temporadas.length - vacias.length,
    vacias: vacias.length,
    cualesVacias: vacias.join(' '),
    competicionesTotales: [...porTemp.values()].reduce((a, b) => a + b, 0),
  }));
} finally {
  db.close();
}
