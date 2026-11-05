import Link from 'next/link';
import type { Route } from 'next';
import { Cifras, type Cifra } from '@/componentes/estadisticas/Cifras';
import { SinDatos } from '@/componentes/estadisticas/Estados';
import type {
  FilaCapacidad, FilaChequeo, FilaCoberturaTemporada, FilaParametroCapacidad,
} from '@/consultas/observabilidad';
import {
  alertaDeChequeo, capacidadesDeFederacion, carenciasDeFederacion, esCasoDeDatos,
  esFederacionDePruebas, estadoConocido, fechaHoraDeCalculo, nombreCortoDeFederacion,
  severidadDeEstado, textoDePorcentaje,
} from '@/lib/observabilidad-pantalla';
import { fechaCorta, numero } from '@/lib/presentacion-canonico';
import { ChipSeveridad, Seccion, TablaResponsiva, type ColumnaDeTabla } from './piezas';

/**
 * Secciones de la pantalla «Datos»: calidad y cobertura.
 *
 * Todo lo que se enseña aquí está calculado o medido: la cobertura sale de la cobertura guardada por
 * grupo, la capacidad de cada federación de la tabla de capacidad, y los casos de las comprobaciones de
 * salud. Los porcentajes imposibles no se publican (se enseña «—»): un dato mal medido no se disfraza de
 * dato.
 */

const ORDEN_SEVERIDAD: Record<string, number> = { grave: 0, aviso: 1, info: 2, ok: 3 };

/** Cifras de cabecera: casos graves, avisos, informativos y actas a revisar. */
export function ResumenDeDatos({ resumen, casosGraves, actasARevisar, ultimaActa }: {
  resumen: { fallos: number; avisos: number; infos: number; ok: number };
  casosGraves: number | null;
  actasARevisar: number | null;
  ultimaActa: string | null;
}) {
  const cifras: Cifra[] = [
    { etiqueta: 'Casos graves abiertos', valor: casosGraves === null ? '—' : numero(casosGraves), nota: 'necesitan una persona' },
    { etiqueta: 'Avisos', valor: numero(resumen.avisos), nota: 'la plataforma ya los trata' },
    { etiqueta: 'Informativos', valor: numero(resumen.infos), nota: 'huecos del origen' },
    {
      etiqueta: 'Actas a revisar (7 días)',
      valor: textoDePorcentaje(actasARevisar),
      nota: ultimaActa ? `Última acta: ${fechaCorta(ultimaActa)}` : 'Sin actas importadas',
    },
  ];
  return <Cifras cifras={cifras} />;
}

/** Casos por tipo: qué se detecta, cuánto hay y qué hace la plataforma con ello. */
export function CasosDeDatos({ chequeos, areas }: {
  chequeos: readonly FilaChequeo[];
  areas: readonly string[];
}) {
  // Lista corta: los tipos de caso de datos, más cualquier comprobación de calidad/identidad que tenga
  // algo medido. Las 68 comprobaciones incluyen una por federación; volcarlas todas es un registro, no
  // una pantalla.
  const deCalidad = new Set(['calidad', 'identidad', ...areas.filter((a) => a === 'procesos')]);
  const casos = chequeos
    .filter((c) => esCasoDeDatos(c.nombre)
      || (deCalidad.has(c.area) && (c.valor ?? 0) > 0 && !c.nombre.startsWith('federacion_sin_lote:')))
    .map((c) => ({ chequeo: c, alerta: alertaDeChequeo(c), severidad: severidadDeEstado(c.estado) }))
    .sort((a, b) => (ORDEN_SEVERIDAD[a.severidad]! - ORDEN_SEVERIDAD[b.severidad]!)
      || a.alerta.titulo.localeCompare(b.alerta.titulo, 'es'));
  return (
    <Seccion id="casos" titulo="Casos por tipo" entradilla="Se detectan solos y se cierran solos si el dato se corrige en origen.">
      {casos.length === 0
        ? <SinDatos titulo="Sin casos que enseñar">Ahora mismo no hay comprobaciones de datos que enseñar.</SinDatos>
        : (
          <ul className="m-0 list-none p-0">
            {casos.map(({ chequeo, alerta }) => (
              <li key={chequeo.nombre} className="border-t border-[var(--fondo-sutil)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ChipSeveridad estado={chequeo.estado} />
                  <p className="m-0 text-dato font-extrabold tabular-nums text-[var(--texto)]">{alerta.valorTexto}</p>
                </div>
                <p className="m-0 mt-1 text-tabla font-semibold text-[var(--texto)]">{alerta.titulo}</p>
                {alerta.tratamiento && (
                  <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{alerta.tratamiento}</p>
                )}
                <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">Límite: {alerta.umbralTexto}</p>
              </li>
            ))}
          </ul>
        )}
    </Seccion>
  );
}

/** Avisos: las comprobaciones de datos que no están en orden, con su cifra. */
export function AvisosDeDatos({ chequeos, areas }: {
  chequeos: readonly FilaChequeo[];
  areas: readonly string[];
}) {
  const deDatos = new Set(['calidad', 'identidad', 'frescura', ...areas]);
  const avisos = chequeos
    .filter((c) => deDatos.has(c.area) && estadoConocido(c.estado) !== 'ok'
      && (esCasoDeDatos(c.nombre) || !c.nombre.startsWith('federacion_sin_lote:')))
    .map((c) => ({ chequeo: c, alerta: alertaDeChequeo(c) }))
    .sort((a, b) => ORDEN_SEVERIDAD[severidadDeEstado(a.chequeo.estado)]!
      - ORDEN_SEVERIDAD[severidadDeEstado(b.chequeo.estado)]!);
  return (
    <Seccion id="avisos" titulo="Avisos de datos" entradilla="Lo que la plataforma ya trata y conviene mirar.">
      {avisos.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin avisos de datos ahora mismo.
          </p>
        )
        : (
          <ul className="m-0 list-none p-0">
            {avisos.map(({ chequeo, alerta }) => (
              <li key={chequeo.nombre} className="border-t border-[var(--fondo-sutil)] px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ChipSeveridad estado={chequeo.estado} />
                  <span className="text-tabla font-semibold tabular-nums text-[var(--texto)]">{alerta.valorTexto}</span>
                </div>
                <p className="m-0 mt-1 text-tabla text-[var(--texto)]">{alerta.titulo}</p>
              </li>
            ))}
          </ul>
        )}
    </Seccion>
  );
}

/** Cobertura de Castilla y León, temporada a temporada, con enlace al selector filtrado. */
export function CoberturaDeCastillaYLeon({ filas }: { filas: readonly FilaCoberturaTemporada[] }) {
  const columnas: ColumnaDeTabla<FilaCoberturaTemporada>[] = [
    {
      titulo: 'Temporada',
      render: (f) => (
        <Link href={`/explorar/competiciones?fed=castilla-leon&temp=${f.temporada}` as Route}
          className="font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
          {f.temporada}
        </Link>
      ),
    },
    { titulo: 'Grupos', tipo: 'numero', render: (f) => numero(f.grupos) },
    { titulo: 'Partidos', tipo: 'numero', render: (f) => numero(f.partidos) },
    {
      titulo: 'Con resultado', tipo: 'numero',
      render: (f) => textoDePorcentaje(f.partidos > 0 ? (100 * f.con_resultado) / f.partidos : null),
    },
    {
      titulo: 'Actas', tipo: 'numero',
      render: (f) => textoDePorcentaje(f.partidos > 0 ? (100 * f.actas_parseadas) / f.partidos : null),
    },
    { titulo: 'A revisar', tipo: 'numero', render: (f) => numero(f.actas_a_revisar) },
    { titulo: 'Calculado', render: (f) => fechaHoraDeCalculo(f.calculado_en) },
  ];
  return (
    <Seccion id="cobertura" titulo="Cobertura de Castilla y León"
      entradilla="Lo que hay importado de cada temporada; se puede abrir la competición para verlo.">
      {filas.length === 0
        ? <SinDatos titulo="Sin cobertura calculada">Todavía no hay cobertura calculada de Castilla y León.</SinDatos>
        : (
          <div className="px-1 pb-1">
            <TablaResponsiva
              filas={filas}
              columnas={columnas}
              caption="Cobertura de Castilla y León por temporada: grupos, partidos, porcentaje con resultado, actas y fecha de comprobación."
              clave={(f) => f.temporada}
            />
          </div>
        )}
    </Seccion>
  );
}

/** Qué datos da cada federación, con lo que no se puede enseñar marcado en palabras. */
export function CapacidadDeFederaciones({ filas, parametros, temporada }: {
  filas: readonly FilaCapacidad[];
  parametros: readonly FilaParametroCapacidad[];
  temporada: string | null;
}) {
  const umbrales = Object.fromEntries(parametros.map((p) => [p.clave, p.valor]));
  const deLaTemporada = filas
    .filter((f) => f.temporada === temporada && !esFederacionDePruebas(f.federacion))
    .sort((a, b) => {
      if (a.federacion === 'castilla-leon') return -1;
      if (b.federacion === 'castilla-leon') return 1;
      return b.partidos - a.partidos;
    });
  const columnas: ColumnaDeTabla<FilaCapacidad>[] = [
    {
      titulo: 'Federación',
      render: (f) => (
        <Link href={`/explorar/competiciones?fed=${f.federacion}&temp=${f.temporada}` as Route} title={f.nombre}
          className="font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
          {nombreCortoDeFederacion(f.federacion)}
        </Link>
      ),
    },
    { titulo: 'Partidos', tipo: 'numero', render: (f) => numero(f.partidos) },
    { titulo: 'Resultado', tipo: 'numero', render: (f) => textoDePorcentaje(f.pct_resultado) },
    { titulo: 'Cambios', tipo: 'numero', render: (f) => textoDePorcentaje(f.pct_cambios) },
    { titulo: 'Tarjetas', tipo: 'numero', render: (f) => textoDePorcentaje(f.pct_tarjetas) },
    { titulo: 'Gol con minuto', tipo: 'numero', render: (f) => textoDePorcentaje(f.pct_minuto_gol) },
    {
      titulo: 'No se puede enseñar',
      render: (f) => {
        const carencias = carenciasDeFederacion(capacidadesDeFederacion(f, umbrales));
        return carencias.length === 0
          ? <span className="text-nota text-[var(--texto-suave)]">completo</span>
          : (
            <span className="flex flex-wrap gap-1">
              {carencias.map((carencia) => (
                <span key={carencia} className="rounded-full bg-[var(--fondo-sutil)] px-2 py-0.5 text-etiqueta text-[var(--texto-suave)]">
                  {carencia}
                </span>
              ))}
            </span>
          );
      },
    },
  ];
  return (
    <Seccion id="capacidad" titulo="Qué datos da cada federación"
      entradilla={temporada
        ? `Temporada de referencia ${temporada}, medida sobre lo importado.`
        : 'Medido sobre lo importado.'}>
      {deLaTemporada.length === 0
        ? <SinDatos titulo="Sin medición">Todavía no hay capacidad medida para esa temporada.</SinDatos>
        : (
          <>
            <div className="px-1 pb-1">
              <TablaResponsiva
                filas={deLaTemporada}
                columnas={columnas}
                caption="Qué datos publica cada federación: partidos, porcentaje con resultado, con cambios, con tarjetas y con minuto de gol, y lo que no se puede enseñar."
                clave={(f) => `${f.federacion}-${f.temporada}`}
              />
            </div>
            <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota text-[var(--texto-suave)]">
              Para publicar los minutos se exige un {textoDePorcentaje(umbrales.min_pct_cambios ?? null)} de cambios,
              un {textoDePorcentaje(umbrales.min_pct_tarjetas ?? null)} de tarjetas para enseñar disciplina y
              un {textoDePorcentaje(umbrales.min_pct_minuto_gol ?? null)} de goles con minuto para los goles por tramo.
            </p>
          </>
        )}
    </Seccion>
  );
}

