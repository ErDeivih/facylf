/*
 * ── ¿A QUÉ FEDERACIÓN LE FALTA HISTORIAL POR DESCUBRIR? ─────────────────────────────────────────────────
 *
 * El 08/10/2026 se descubrió que **Cataluña sólo tenía 2 temporadas descubiertas** (2025-26 y 2026-27) cuando
 * su configuración dice `desdeAnio: 2015` — es decir, **le faltaban diez temporadas enteras**, y su recolector
 * de datos parecía «parado» porque sólo puede recoger lo que el catálogo tiene.
 *
 * Eso no se ve en ningún resumen de ritmo: una federación con el historial sin descubrir **no está parada, está
 * esperando un catálogo que nadie ha ido a buscar**. Y se confunde con «no hay trabajo», que es exactamente lo
 * que llevo toda la faena aprendiendo a no confundir con «está hecho».
 *
 * Esta cuenta lo hace visible: por cada cola, cuántas temporadas tiene el catálogo, cuántas debería tener
 * según su configuración, y cuántas competiciones hay en cada una.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/diagnostica-catalogo.mjs <cola.sqlite> <etiqueta> [desdeAnio]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, etiqueta, desdeAnio] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) { console.log(`${etiqueta ?? ruta}: no encuentro la cola`); process.exit(0); }
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
try {
  const temps = db.prepare('select codigo, etiqueta from temporadas order by cast(codigo as integer)').all();
  const comps = db.prepare('select temporada, count(*) n from competiciones group by 1').all();
  const porTemp = new Map(comps.map((c) => [String(c.temporada), Number(c.n)]));
  const total = db.prepare('select count(*) n from competiciones').get().n;
  const grupos = db.prepare('select count(*) n from trabajos where tipo = ?').get('grupos')?.n ?? 0;

  const anios = temps.map((t) => Number(String(t.etiqueta).slice(0, 4))).filter(Number.isFinite);
  const min = anios.length ? Math.min(...anios) : null;
  const max = anios.length ? Math.max(...anios) : null;
  const esperadas = (desdeAnio && max) ? (max - Number(desdeAnio) + 1) : null;
  const faltan = (esperadas && temps.length) ? esperadas - temps.length : null;

  console.log(JSON.stringify({
    federacion: etiqueta ?? ruta,
    temporadas: temps.length,
    desde: min, hasta: max,
    desdeAnioConfig: desdeAnio ? Number(desdeAnio) : null,
    esperadas, faltan,
    competiciones: Number(total),
    grupos,
    porTemporada: temps.map((t) => `${t.etiqueta}:${porTemp.get(String(t.codigo)) ?? 0}`).join(' '),
  }));
} finally {
  db.close();
}
