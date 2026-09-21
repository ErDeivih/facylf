/**
 * Banco de pruebas de la reconstrucción: monta una raíz temporal con una cola SQLite pequeña y su HTML
 * archivado, para ejercitar la herramienta de punta a punta **sin tocar ninguna cola real**.
 *
 * Por qué una raíz temporal y no la cola de Euskadi: la cola real la están escribiendo los workers, y una
 * prueba que la abriera en escritura podría corromper el trabajo de horas. Aquí la cola es sintética,
 * pesa decenas de KB y se puede romper a gusto.
 *
 * El HTML no es decorativo: lo lee el extractor REAL (`extraePartidosWidget`), así que si la maqueta
 * cambia, estas pruebas dejan de encontrar filas y fallan — que es justo lo que se quiere.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import type { DatabaseSync as TipoDatabaseSync } from 'node:sqlite';

/**
 * `node:sqlite` con `createRequire`, igual que `packages/canonico/src/origen/sqlite.ts`: un `import`
 * normal hace que Vite le quite el prefijo `node:` y busque un paquete `sqlite` inexistente.
 */
const requerir = createRequire(import.meta.url);
const sqlite = requerir('node:sqlite') as {
  DatabaseSync: typeof TipoDatabaseSync;
  backup: (origen: TipoDatabaseSync, destino: string) => Promise<void>;
};
export const DatabaseSync = sqlite.DatabaseSync;
export const backup = sqlite.backup;
/** El nombre sirve como valor y como tipo, para no cambiar el resto del código de prueba. */
export type DatabaseSync = TipoDatabaseSync;

export type OpcionesBanco = {
  /** Raíz temporal. Se crea vacía. */
  raiz: string;
  /** Grupos a montar. Por defecto, uno con dos jornadas. */
  grupos?: Array<GrupoBanco>;
};

export type FilaBanco = {
  orden: number;
  local: string;
  visitante: string;
  /** Códigos del enlace de comparativa, que es el ÚNICO código de equipo que publica la maqueta nova. */
  codigos?: [string | null, string | null];
  /** Literal limpio que publica el acta. Si es `null`, no hay acta para esta fila. */
  acta?: [string, string] | null;
  codActa?: string | null;
  /** Lo que la cola dice AHORA en el HTML, distinto del HTML, para probar el «cambió desde la simulación». */
  localEnCola?: string;
  visitanteEnCola?: string;
  codigosEnCola?: [string | null, string | null];
  /**
   * La fila la publica el HTML y NO existe en `partidos`: es el estado en que queda un bloque de descanso
   * **después de que un lote lo retire**, y es el caso que dejó de reconocerse cuando la detección del bloque
   * miraba la cola. Su `orden` se ignora —no hay fila que numerar—; el acta, en cambio, se guarda igual,
   * porque retirar un partido no retira su acta.
   */
  soloEnHtml?: boolean;
};

export type GrupoBanco = {
  temporada: string;
  competicion: string;
  grupo: string;
  jornadas: Array<{ numero: number; filas: FilaBanco[] }>;
  /** Añade la clasificación archivada con enlaces `codequipo=`. */
  clasificacion?: Array<{ nombre: string; codigo: string }>;
  /** Marca la jornada como `en_curso` en `trabajos`, como haría el worker. */
  enCurso?: number[];
  /** Deja la jornada SIN archivo en disco, aunque la fila de `jornadas` lo mencione. */
  sinArchivo?: number[];
  /**
   * Guarda en `jornadas.hash` una huella que NO es la del HTML del disco, como queda una jornada que el
   * worker volvió a comprobar después de que se copiara la cola. Es el caso que la reconstrucción tiene
   * que detectar: el archivo del disco ya no es el que produjo estas filas.
   */
  hashDesfasado?: number[];
  /**
   * Maqueta **iSquad** (Madrid y Valencia): la jornada archivada es un JSON
   * (`{"partidos":[{cod_equipo_local,…}]}`) en vez de HTML, y el bloque de descanso se reconoce por
   * **código de equipo negativo**. El archivo se escribe como `jornada-N.json`, sin comprimir, igual que en
   * la carpeta real (`medido: 8.285 de 8.287 ficheros en Madrid son `.json` sin comprimir`).
   */
  isquad?: boolean;
};

/** Una fila de la maqueta nova. Es HTML mínimo pero con los selectores que usa el extractor real. */
/*
 * El enlace del acta SÓLO se dibuja cuando el caso lo declara (`codActa` explícito). Es lo que decide si el
 * extractor emite la fila o la aparta: con enlace de acta, un bloque de descanso se emite y se declara
 * `sospechosa`; sin él, se aparta. Sin esta distinción, el banco no podía montar el caso real de un
 * partido DESPLAZADO —la fila pone el descanso y el acta nombra dos equipos reales—, que es el único caso
 * en el que la evidencia prohíbe borrar la fila.
 */
export function filaHtml(f: { local: string; visitante: string; codigos?: [string | null, string | null]; codActa?: string | null }): string {
  const [a, b] = f.codigos ?? [null, null];
  const comparativa = a && b
    ? `<td><a href="NFG_LstComparativaEquipos?equipo1=${a}&amp;equipo2=${b}">comp</a></td>`
    : '<td></td>';
  const enlaceActa = f.codActa ? `<td><a href="NFG_VisActa?CodActa=${f.codActa}">acta</a></td>` : '<td></td>';
  return `<tr>
  <td class="font_widgetL"><h4>${f.local}</h4></td>
  <td class="wid2_resultado"><span class="fa-1">1</span></td>
  <td class="wid2_resultado"><span class="fa-2">1</span></td>
  <td class="font_widgetV"><h4>${f.visitante}</h4></td>
  ${comparativa}
  ${enlaceActa}
  <td><span class="horario">12-10-2025</span><span class="horario">10:00</span>
      <a href="NFG_VisCampos?Codigo_Campo=77">CAMPO UNO</a>Epailea: ANA GARCIA</td>
</tr>`;
}

export function htmlJornada(filas: FilaBanco[]): string {
  return `<html><body><table><tbody>${filas.map(filaHtml).join('\n')}</tbody></table></body></html>`;
}

/**
 * La jornada tal y como la archiva el recolector de iSquad: JSON normalizado, con una entrada por partido
 * y el bloque de descanso **incluido** (con su código negativo), que es como lo publica la fuente y como lo
 * guardó la cola histórica antes de que se corrigiera el recolector.
 */
export function jsonJornada(filas: FilaBanco[], jornada: number): string {
  return JSON.stringify({
    origen: 'resultados_por_grupo_jornada',
    jornada: String(jornada),
    partidos: filas.map((f) => {
      const [a, b] = f.codigos ?? [null, null];
      return {
        codacta: f.codActa === null ? '' : (f.codActa ?? `acta-${jornada}-${f.orden}`),
        cod_equipo_local: a ?? '',
        cod_equipo_visitante: b ?? '',
        local: f.local,
        visitante: f.visitante,
        resultado: '1-1',
        fecha: '12/10/2025',
        hora: '10:00',
        campo: 'CAMPO UNO',
      };
    }),
  });
}

const ESQUEMA = `
  pragma journal_mode = WAL;
  pragma foreign_keys = ON;
  create table partidos (temporada text, competicion text, grupo text, jornada integer, orden integer,
    codigo_acta text, equipo_local_codigo text, equipo_visitante_codigo text, local text, visitante text,
    goles_local integer, goles_visitante integer, fecha text, hora text, campo text, campo_codigo text,
    arbitro text, actualizado_en text,
    primary key (temporada, competicion, grupo, jornada, orden));
  create table jornadas (temporada text, competicion text, grupo text, numero integer, fecha text,
    archivo text, hash text, comprobada_en text, primary key (temporada, competicion, grupo, numero));
  create table actas (codigo text, temporada text, competicion text, grupo text, jornada integer,
    datos text, estado text, primary key (codigo, temporada, competicion, grupo));
  create table trabajos (clave text primary key, tipo text, temporada text, competicion text, grupo text,
    jornada integer, estado text);
  create table equipos (temporada text, codigo text, nombre text, primera_jornada integer);
  create table competiciones (temporada text, codigo text, nombre text, origen text, comprobada_en text,
    grupos_comprobados_en text);
  create table temporadas (codigo text primary key, etiqueta text, origen text, comprobada_en text);
  create table metadatos (clave text primary key, valor text);
`;

export type Banco = {
  raiz: string;
  rutaCola: string;
  base: string;
  /** Ruta del directorio del grupo. */
  dirDe: (grupo: string, competicion: string) => string;
  /** Ruta del HTML archivado de una jornada, para poder cambiarlo en una prueba. */
  rutaHtmlDe: (grupo: string, competicion: string, jornada: number) => string;
  leerFila: (grupo: string, jornada: number, orden: number) => Record<string, unknown> | undefined;
  escribirFila: (grupo: string, jornada: number, orden: number, campos: Record<string, unknown>) => void;
  abre: () => DatabaseSync;
  /** Copia consistente por la API de SQLite, para comparar el estado lógico. */
  copiaConsistente: (destino: string) => Promise<void>;
  /**
   * Estado lógico completo de `partidos`, ordenado y sin `actualizado_en`. Es lo que se compara para
   * decir «igual» sin mirar tamaños ni fechas de fichero.
   */
  estadoLogico: () => string[];
};

const AGRUPADO = { 'castilla-leon': 'descargas-federacion' };
const carpetaFederacion = (federacion: string) => AGRUPADO[federacion as keyof typeof AGRUPADO] ?? `descargas-${federacion}`;

/**
 * Monta el banco. La cola queda como la dejaría el recolector: los nombres del calendario tal y como los
 * publica el HTML (con marcador de estado incluido) y las actas con el nombre limpio.
 */
export function montaBanco(opciones: OpcionesBanco & { federacion?: string }): Banco {
  const federacion = opciones.federacion ?? 'euskadi';
  rmSync(opciones.raiz, { recursive: true, force: true });
  const base = join(opciones.raiz, carpetaFederacion(federacion), 'recolector-local');
  mkdirSync(base, { recursive: true });
  const rutaCola = join(base, 'cola-v2.sqlite');

  const db = new DatabaseSync(rutaCola);
  db.exec(ESQUEMA);

  const grupos = opciones.grupos ?? [{
    temporada: '21', competicion: '900', grupo: '901',
    jornadas: [{ numero: 1, filas: DEFAULT_FILAS }],
  }];

  const temporadas = new Set<string>();
  for (const g of grupos) {
    temporadas.add(`${g.temporada}|${etiquetaDe(g.temporada)}`);
    const dir = join(base, `t${g.temporada}-${etiquetaDe(g.temporada)}`, `comp-${g.competicion}`, `grupo-${g.grupo}`);
    mkdirSync(dir, { recursive: true });
    db.prepare('insert or replace into competiciones values (?,?,?,?,?,?)')
      .run(g.temporada, g.competicion, 'Liga Juvenil', 'web', null, null);
    if (g.clasificacion) {
      const enlaces = g.clasificacion
        .map((c) => `<a href="NFG_VisCompeticiones_Grupo?codequipo=${c.codigo}">${c.nombre}</a>`).join('\n');
      // iSquad publica la clasificación en JSON (`equipo` + `equipoCodigo`), y ahí está el código de los
      // equipos que el calendario no nombra: sin esta fuente, un partido desplazado se declara pero no se
      // puede recuperar.
      if (g.isquad) {
        writeFileSync(join(dir, 'clasificacion.json'), JSON.stringify(g.clasificacion
          .map((c, i) => ({ posicion: i + 1, equipoCodigo: c.codigo, equipo: c.nombre, puntos: 0 }))));
      } else {
        writeFileSync(join(dir, 'clasificacion.html.gz'), gzipSync(`<html><body>${enlaces}</body></html>`));
      }
    }
    for (const j of g.jornadas) {
      const rutaHtml = join(dir, g.isquad ? `jornada-${j.numero}.json` : `jornada-${j.numero}.html.gz`);
      const sinArchivo = (g.sinArchivo ?? []).includes(j.numero);
      if (!sinArchivo) {
        writeFileSync(rutaHtml, g.isquad ? jsonJornada(j.filas, j.numero) : gzipSync(htmlJornada(j.filas)));
      }
      db.prepare('insert or replace into jornadas values (?,?,?,?,?,?,?,?)')
        .run(g.temporada, g.competicion, g.grupo, j.numero, null, sinArchivo ? join(dir, 'jornada-ausente.html') : rutaHtml,
          (g.hashDesfasado ?? []).includes(j.numero) ? 'f'.repeat(64) : null, null);
      if ((g.enCurso ?? []).includes(j.numero)) {
        db.prepare('insert or replace into trabajos values (?,?,?,?,?,?,?)')
          .run(`${g.temporada}|${g.competicion}|${g.grupo}|${j.numero}`, 'jornada', g.temporada, g.competicion, g.grupo, j.numero, 'en_curso');
      }
      for (const f of j.filas) {
        // Lo que la cola dice hoy. Por defecto, el literal del HTML con el marcador ya separado para la
        // parte que NO reconstruye (marcador, campo...) y SIN código de equipo, que es el estado real de
        // Euskadi: 30.314 de 34.358 partidos sin ningún código.
        const codigosCola = f.codigosEnCola ?? [null, null];
        if (f.soloEnHtml) {
          // Sin fila en `partidos`, pero CON acta si el caso la declara: así se puede montar el bloque ya
          // retirado que la fuente sigue publicando.
          if (f.acta) {
            db.prepare('insert or replace into actas values (?,?,?,?,?,?,?)')
              .run(f.codActa ?? `acta-${g.grupo}-${j.numero}-${f.orden}`, g.temporada, g.competicion, g.grupo, j.numero,
                JSON.stringify({ local: f.acta[0], visitante: f.acta[1] }), 'hecha');
          }
          continue;
        }
        db.prepare(`insert or replace into partidos values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          g.temporada, g.competicion, g.grupo, j.numero, f.orden,
          f.codActa === undefined ? `acta-${g.grupo}-${j.numero}-${f.orden}` : f.codActa,
          codigosCola[0], codigosCola[1],
          f.localEnCola ?? f.local, f.visitanteEnCola ?? f.visitante,
          1, 1, '2025-10-12', '10:00', 'CAMPO UNO', '77', 'ANA GARCIA', '2026-01-01T00:00:00.000Z',
        );
        if (f.acta !== null) {
          const [al, av] = f.acta ?? [quitaMarcadores(f.local), quitaMarcadores(f.visitante)];
          const codigoActa = f.codActa === undefined ? `acta-${g.grupo}-${j.numero}-${f.orden}` : f.codActa;
          if (codigoActa) {
            db.prepare('insert or replace into actas values (?,?,?,?,?,?,?)')
              .run(codigoActa, g.temporada, g.competicion, g.grupo, j.numero,
                JSON.stringify({ local: al, visitante: av }), 'hecha');
          }
        }
      }
    }
  }
  for (const t of temporadas) {
    const [codigo, etiqueta] = t.split('|') as [string, string];
    db.prepare('insert or replace into temporadas values (?,?,?,?)').run(codigo, etiqueta, 'web', null);
  }
  // La tabla `equipos` sólo tiene los equipos CON código, que es lo que publica el catálogo de la fuente.
  for (const g of grupos) {
    const vistos = new Set<string>();
    for (const j of g.jornadas) {
      for (const f of j.filas) {
        const codigos = f.codigos ?? [null, null];
        for (const [nombre, codigo] of [[f.local, codigos[0]], [f.visitante, codigos[1]]] as const) {
          if (!codigo || vistos.has(codigo)) continue;
          vistos.add(codigo);
          db.prepare('insert or replace into equipos values (?,?,?,?)').run(g.temporada, codigo, quitaMarcadores(nombre), 1);
        }
      }
    }
  }
  db.close();

  const dirDe = (grupo: string, competicion: string) => {
    const g = grupos.find((x) => x.grupo === grupo && x.competicion === competicion)!;
    return join(base, `t${g.temporada}-${etiquetaDe(g.temporada)}`, `comp-${competicion}`, `grupo-${grupo}`);
  };

  return {
    raiz: opciones.raiz, rutaCola, base,
    dirDe,
    rutaHtmlDe: (grupo, competicion, jornada) => join(dirDe(grupo, competicion), `jornada-${jornada}.html.gz`),
    leerFila: (grupo, jornada, orden) => {
      const d = new DatabaseSync(rutaCola, { readOnly: true });
      try {
        return d.prepare('select * from partidos where grupo=? and jornada=? and orden=?').get(grupo, jornada, orden) as Record<string, unknown> | undefined;
      } finally { d.close(); }
    },
    escribirFila: (grupo, jornada, orden, campos) => {
      const d = new DatabaseSync(rutaCola);
      try {
        for (const [k, v] of Object.entries(campos)) {
          d.prepare(`update partidos set ${k}=? where grupo=? and jornada=? and orden=?`).run(v as never, grupo, jornada, orden);
        }
      } finally { d.close(); }
    },
    abre: () => new DatabaseSync(rutaCola, { readOnly: true }),
    copiaConsistente: async (destino: string) => {
      const origen = new DatabaseSync(rutaCola, { readOnly: true });
      await backup(origen, destino);
      origen.close();
    },
    estadoLogico: () => {
      const d = new DatabaseSync(rutaCola, { readOnly: true });
      try {
        return (d.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta,
            equipo_local_codigo, equipo_visitante_codigo, local, visitante, goles_local, goles_visitante,
            fecha, hora, campo, campo_codigo, arbitro
          from partidos order by temporada, competicion, grupo, jornada, orden`).all() as unknown as Array<Record<string, unknown>>)
          .map((f) => JSON.stringify(f));
      } finally { d.close(); }
    },
  };
}

export function quitaMarcadores(nombre: string): string {
  return nombre.replace(/\(\s*(?:sailkatua|irabazlea|ganador|clasificado)\s*\)/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function etiquetaDe(codigoTemporada: string): string {
  const n = Number(codigoTemporada);
  return `${2000 + n - 1}-${String(n).slice(-2)}`;
}

/** Un partido con marcador de estado en el calendario y nombre limpio en el acta: el caso de Euskadi. */
export const DEFAULT_FILAS: FilaBanco[] = [
  { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
  { orden: 1, local: '(Irabazlea) EIBAR "C"', visitante: 'DERIO C.D.', codigos: ['333', '444'], acta: ['EIBAR C', 'DERIO C.D.'] },
];

export function borraBanco(raiz: string): void {
  if (existsSync(raiz)) rmSync(raiz, { recursive: true, force: true });
}
