import { unstable_cache } from 'next/cache';
import { consulta } from './adaptadores/postgres/conexion';
import {
  CHEQUEOS_DE_LA_PLATAFORMA, FRESCURA_Y_COBERTURA, type FilaChequeo, type FilaFrescura,
} from './observabilidad';

/**
 * Las comprobaciones de salud, cacheadas.
 *
 * `ops.chequeos()` tarda segundos por diseño: cuenta ventanas de 60 días sobre partidos, eventos y
 * apariciones para detectar datos imposibles. Eso no puede pagarlo cada visita a Datos y a Salud, y
 * tampoco tiene sentido: la vigilancia de la plataforma ya las recalcula cada 15 minutos.
 *
 * Se cachean 5 minutos y se comparten entre las dos pantallas (misma clave y misma etiqueta). El
 * presupuesto de 6 s abre una conexión propia para que una máquina cargada no la corte con el límite de
 * 5 s del resto de la web; si aun así no responde, cada pantalla enseña su estado de error sin inventar.
 */
export const chequeosEnVivo = unstable_cache(
  async (): Promise<FilaChequeo[]> =>
    consulta<FilaChequeo>(CHEQUEOS_DE_LA_PLATAFORMA.sql, [], { presupuestoMs: 6000 }),
  ['chequeos-de-la-plataforma'],
  { revalidate: 300, tags: ['salud'] },
);

/**
 * La frescura y la cobertura guardada de cada federación, cacheadas.
 *
 * La parte cara es `max(ingested_at)` sobre `core.match_report` (no hay índice por fecha de ingesta):
 * unos cientos de milisegundos que no tienen por qué pagar las dos pantallas en cada visita. Se cachea
 * con la misma etiqueta que las comprobaciones.
 */
export const frescuraYCobertura = unstable_cache(
  async (): Promise<FilaFrescura | null> => {
    const [fila] = await consulta<FilaFrescura>(FRESCURA_Y_COBERTURA.sql, [], { presupuestoMs: 1200 });
    return fila ?? null;
  },
  ['frescura-y-cobertura'],
  { revalidate: 300, tags: ['salud'] },
);
