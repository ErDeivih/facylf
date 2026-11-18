import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { clave, type Partido } from '@facylf/dominio';
import { decodifica } from './texto.js';
import { parseaCalendario } from './parsers/calendario.js';
import { parseaJornada } from './parsers/jornada.js';

export interface TemporadaReconstruida {
  slug: string;
  partidos: Partido[];
  conResultado: number;
  sinResultado: number;
  jornadas: number;
}

/**
 * Une el calendario (emparejamientos) con los resultados de cada jornada ya bajados
 * (`<slug>-jornada-N.html`, parseados con `parseaJornada`) para obtener los `Partido[]`
 * con goles. Eso es lo que alimenta `calculaClasificacion`/`evolucionPorJornada` y las
 * gráficas de la web. Los partidos sin resultado quedan con goles nulos.
 */
export function reconstruyeTemporada(slug: string, carpeta: string): TemporadaReconstruida {
  const cal = parseaCalendario(decodifica(readFileSync(join(carpeta, `${slug}-calendario.xls`))));
  const escapa = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escapa}-jornada-(\\d+)\\.html$`);

  // índice de resultados por jornada (clave normalizada de local|visitante → marcador)
  const resultados = new Map<number, Map<string, { gl: number | null; gv: number | null }>>();
  for (const f of readdirSync(carpeta)) {
    const m = re.exec(f);
    if (!m) continue;
    const j = Number(m[1]!);
    const res = parseaJornada(decodifica(readFileSync(join(carpeta, f))), j);
    const mapa = new Map<string, { gl: number | null; gv: number | null }>();
    // Un partido sin jugar llega con el marcador a null; aqui solo interesan los que tienen resultado.
    for (const r of res) if (r.golesLocal !== null && r.golesVisitante !== null) mapa.set(`${clave(r.local)}|${clave(r.visitante)}`, { gl: r.golesLocal, gv: r.golesVisitante });
    resultados.set(j, mapa);
  }

  const partidos: Partido[] = cal.partidos.map((p) => {
    const hit = resultados.get(p.jornada)?.get(`${clave(p.local)}|${clave(p.visitante)}`);
    return hit ? { ...p, golesLocal: hit.gl, golesVisitante: hit.gv } : p;
  });

  const conResultado = partidos.filter((p) => p.golesLocal !== null).length;
  return { slug, partidos, conResultado, sinResultado: partidos.length - conResultado, jornadas: cal.jornadas };
}
