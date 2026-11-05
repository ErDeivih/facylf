import { SinDatos } from '@/componentes/estadisticas/Estados';
import type { CoberturaDeFederacion, FilaChequeo } from '@/consultas/observabilidad';
import {
  agrupaChequeosPorArea, alertaDeChequeo, fechaHoraDeCalculo, nombreCortoDeFederacion,
  textoDePorcentaje, textoDeValor, tratamientoDeChequeo,
} from '@/lib/observabilidad-pantalla';
import { fechaCorta, numero } from '@/lib/presentacion-canonico';
import { ChipSeveridad, Seccion, TablaResponsiva, type ColumnaDeTabla } from './piezas';

/**
 * Secciones de la pantalla «Salud»: el estado de la plataforma AHORA, leído de las comprobaciones.
 *
 * No hay gráficos inventados ni cifras de relleno. Lo que no se puede medir se dice: el tiempo de
 * respuesta por página no se guarda hoy, así que la sección de rendimiento enseña las comprobaciones que
 * sí existen y escribe que no hay medición por petición. Las cuentas y la publicidad no se enseñan.
 */

/** Estado por área: el peor estado de las comprobaciones de cada área y su recuento. */
export function EstadoDeLasAreas({ chequeos, areas }: {
  chequeos: readonly FilaChequeo[];
  areas: readonly string[];
}) {
  const porArea = agrupaChequeosPorArea(chequeos, areas);
  if (porArea.length === 0) {
    return <SinDatos titulo="Sin comprobaciones">Ahora mismo no hay comprobaciones que enseñar.</SinDatos>;
  }
  return (
    <section aria-label="Estado por área" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {porArea.map((area) => (
        <div key={area.area} className="flex items-start gap-2.5 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3.5 py-3">
          <span className="mt-1 flex-none"><ChipSeveridad estado={area.estado} /></span>
          <div className="min-w-0">
            <p className="m-0 text-tabla font-semibold text-[var(--texto)]">{area.etiqueta}</p>
            <p className="m-0 text-nota text-[var(--texto-suave)]">
              {area.fallos} {area.fallos === 1 ? 'fallo' : 'fallos'} · {area.avisos} {area.avisos === 1 ? 'aviso' : 'avisos'} de {area.total} {area.total === 1 ? 'comprobación' : 'comprobaciones'}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Alertas abiertas: las comprobaciones en fallo o aviso, con lo que valen y su umbral. */
export function AlertasAbiertas({ chequeos, areas }: {
  chequeos: readonly FilaChequeo[];
  areas: readonly string[];
}) {
  const incluidas = new Set(areas);
  const abiertas = chequeos
    .filter((c) => incluidas.has(c.area) && (c.estado === 'fallo' || c.estado === 'aviso'))
    .map((c) => ({ chequeo: c, alerta: alertaDeChequeo(c), tratamiento: tratamientoDeChequeo(c.nombre) }))
    .sort((a, b) => (a.alerta.severidad === 'grave' ? 0 : 1) - (b.alerta.severidad === 'grave' ? 0 : 1));
  return (
    <Seccion id="alertas" titulo="Alertas abiertas" entradilla="Lo que ahora mismo no está en orden.">
      {abiertas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin alertas: todas las comprobaciones de las áreas que se enseñan están en orden.
          </p>
        )
        : (
          <ul className="m-0 list-none p-0">
            {abiertas.map(({ chequeo, alerta, tratamiento }) => (
              <li key={chequeo.nombre} className="border-t border-[var(--fondo-sutil)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ChipSeveridad estado={chequeo.estado} />
                  <p className="m-0 text-dato font-extrabold tabular-nums text-[var(--texto)]">{alerta.valorTexto}</p>
                </div>
                <p className="m-0 mt-1 text-tabla font-semibold text-[var(--texto)]">{alerta.titulo}</p>
                {tratamiento && <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">{tratamiento}</p>}
                <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">Límite: {alerta.umbralTexto}</p>
              </li>
            ))}
          </ul>
        )}
    </Seccion>
  );
}

/** Datos por federación: cobertura guardada y cuándo se calculó. */
export function DatosPorFederacion({ cobertura }: { cobertura: readonly CoberturaDeFederacion[] }) {
  const columnas: ColumnaDeTabla<CoberturaDeFederacion>[] = [
    {
      titulo: 'Federación',
      render: (f) => <span title={f.nombre}>{nombreCortoDeFederacion(f.federacion)}</span>,
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
    { titulo: 'Última comprobación', render: (f) => fechaHoraDeCalculo(f.calculado_en) },
  ];
  return (
    <Seccion id="federaciones" titulo="Datos por federación"
      entradilla="Cobertura guardada de cada federación y cuándo se calculó.">
      {cobertura.length === 0
        ? <SinDatos titulo="Sin cobertura">Todavía no hay cobertura calculada de ninguna federación.</SinDatos>
        : (
          <div className="px-1 pb-1">
            <TablaResponsiva
              filas={cobertura}
              columnas={columnas}
              caption="Datos por federación: grupos, partidos, porcentaje con resultado, actas y fecha de la última comprobación de cobertura."
              clave={(f) => f.federacion}
            />
          </div>
        )}
    </Seccion>
  );
}

/** Rendimiento: lo que se comprueba de verdad y lo que todavía no se mide. */
export function RendimientoDeLaPlataforma({ chequeos, areas }: {
  chequeos: readonly FilaChequeo[];
  areas: readonly string[];
}) {
  const incluidas = new Set(areas);
  const delRendimiento = chequeos.filter((c) => incluidas.has(c.area) && (c.area === 'rendimiento' || c.area === 'web'));
  return (
    <Seccion id="rendimiento" titulo="Velocidad y disponibilidad"
      entradilla="Lo que la plataforma comprueba sobre la marcha.">
      <div className="border-t border-[var(--fondo-sutil)] px-4 py-3">
        <p className="m-0 text-tabla text-[var(--texto)]">
          Sin medición del tiempo de respuesta por página todavía: no se guarda el tiempo de cada petición.
        </p>
        <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
          Lo que sí se comprueba ahora mismo es esto:
        </p>
        <ul className="m-0 mt-2 list-none p-0">
          {delRendimiento.map((chequeo) => {
            const alerta = alertaDeChequeo(chequeo);
            return (
              <li key={chequeo.nombre} className="border-t border-[var(--fondo-sutil)] py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ChipSeveridad estado={chequeo.estado} />
                  <span className="text-tabla font-semibold tabular-nums text-[var(--texto)]">{alerta.valorTexto}</span>
                </div>
                <p className="m-0 mt-1 text-tabla text-[var(--texto)]">
                  {alerta.titulo} <span className="text-nota text-[var(--texto-suave)]">· límite {alerta.umbralTexto}</span>
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </Seccion>
  );
}

/** Calidad de los datos: las comprobaciones de calidad e identidad y la última acta importada. */
export function CalidadDeLosDatos({ chequeos, ultimaActa }: {
  chequeos: readonly FilaChequeo[];
  ultimaActa: string | null;
}) {
  const deCalidad = chequeos
    .filter((c) => c.area === 'calidad' || c.area === 'identidad')
    .map((c) => ({ chequeo: c, alerta: alertaDeChequeo(c) }));
  return (
    <Seccion id="calidad" titulo="Calidad de los datos"
      entradilla="Lo que se revisa del dato y la última acta que entró.">
      {ultimaActa && (
        <p className="border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota text-[var(--texto-suave)]">
          Última acta importada: {fechaCorta(ultimaActa)}
        </p>
      )}
      {deCalidad.length === 0
        ? <p className="px-4 py-3.5 text-tabla text-[var(--texto-suave)]">Sin comprobaciones de calidad.</p>
        : (
          <ul className="m-0 list-none p-0">
            {deCalidad.map(({ chequeo, alerta }) => (
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

/** Copias de seguridad: cuándo se hizo la última y cuándo se probó restaurarla. */
export function CopiasDeSeguridad({ chequeos }: { chequeos: readonly FilaChequeo[] }) {
  const copia = chequeos.find((c) => c.nombre === 'copia_de_seguridad');
  const restauracion = chequeos.find((c) => c.nombre === 'restauracion_probada');
  const textoCopia = !copia
    ? 'Sin comprobación de copias.'
    : copia.valor === null
      ? 'Sin copia registrada.'
      : `hace ${textoDeValor(copia.valor, 'horas')}`;
  const textoRestauracion = !restauracion
    ? 'Sin comprobación de restauración.'
    : restauracion.valor === null
      ? 'sin restauración probada registrada'
      : `hace ${textoDeValor(restauracion.valor, 'días')}`;
  return (
    <Seccion id="copias" titulo="Copias de seguridad" entradilla="La copia y la restauración de prueba, que es lo que se comprueba.">
      <ul className="m-0 list-none p-0">
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
          <ChipSeveridad estado={copia?.estado ?? 'info'} />
          <span className="min-w-0 flex-1 text-tabla text-[var(--texto)]">Última copia</span>
          <span className="text-tabla font-semibold text-[var(--texto)]">{textoCopia}</span>
          <span className="text-nota text-[var(--texto-suave)]">límite {textoDeValor(copia?.umbral ?? null, 'horas')}</span>
        </li>
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
          <ChipSeveridad estado={restauracion?.estado ?? 'info'} />
          <span className="min-w-0 flex-1 text-tabla text-[var(--texto)]">Restauración de prueba</span>
          <span className="text-tabla font-semibold text-[var(--texto)]">{textoRestauracion}</span>
          <span className="text-nota text-[var(--texto-suave)]">límite {textoDeValor(restauracion?.umbral ?? null, 'días')}</span>
        </li>
      </ul>
    </Seccion>
  );
}


