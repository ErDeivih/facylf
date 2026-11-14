import Link from 'next/link';
import type { Route } from 'next';
import { TARJETA } from '@/componentes/estadisticas/controles';
import {
  ESTADO_DE_PUBLICIDAD, HUECOS_PUBLICITARIOS, REGLAS_DE_PUBLICIDAD, REQUISITOS_PARA_ANUNCIOS,
} from '@/lib/publicidad';

/**
 * La página pública de publicidad, contra `prototipo/Publicidad.dc.html`.
 *
 * No es el panel de administración (eso vive en `/admin`): aquí se cuenta **qué publicidad hay, dónde
 * irían los huecos y qué reglas se aplican**. Hoy no hay ninguna campaña ni ningún espacio contratado,
 * y se dice tal cual; no se inventan patrocinadores de ejemplo. Los huecos y su formato son los que
 * dejó la migración 0033; el estado está comprobado contra el canónico y se indica su fecha.
 */

const MARGEN = 'px-4 py-3.5';

/** Cabecera: qué es esta página y en qué estado está la publicidad. */
export function CabeceraPublicidad() {
  return (
    <section className="flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Publicidad</h1>
        <p className="m-0 max-w-[62ch] text-tabla text-[var(--texto-suave)]">
          Qué publicidad hay hoy, dónde irían los huecos si la hubiera y qué reglas se aplican. Esta
          página es informativa: la administración de campañas no está aquí.
        </p>
      </div>
      <div className="flex flex-col items-start gap-1 rounded-[var(--radius-lg)] bg-[var(--fondo-sutil)] px-3 py-2">
        <span className="flex items-center gap-2 text-tabla font-bold text-[var(--texto)]">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--texto-tenue)]" />
          Sin publicidad
        </span>
        <span className="text-nota text-[var(--texto-suave)]">
          Comprobado el {ESTADO_DE_PUBLICIDAD.comprobadoEl}
        </span>
      </div>
    </section>
  );
}

/** Un hueco dibujado en el esquema: alto reservado y su formato escrito. */
function HuecoEnEsquema({ etiqueta, formato }: { etiqueta: string; formato: string }) {
  return (
    <div className="flex min-h-12 flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--borde-fuerte)] px-2 py-2 text-center">
      <span className="text-nota font-bold text-[var(--texto)]">{etiqueta}</span>
      <span className="text-etiqueta text-[var(--texto-suave)]">{formato}</span>
    </div>
  );
}

/** Esquema de dónde irían los huecos en una ficha de competición. */
export function DondeVanLosHuecos() {
  return (
    <section aria-labelledby="donde-van" className={`${TARJETA} ${MARGEN} flex flex-col gap-3`}>
      <div className="flex flex-col gap-0.5">
        <h2 id="donde-van" className="m-0 text-bloque font-bold text-[var(--texto)]">Dónde van los huecos</h2>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          Esquema de la ficha de competición. Cada hueco reserva su alto antes de cargar, para que la página no salte.
        </p>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--borde)] bg-[var(--fondo-sutil)] p-2.5">
        <div className="h-6 rounded-[4px] bg-[var(--fondo-fuerte)]" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-[3] flex-col gap-2">
            <div className="rounded-[var(--radius-md)] bg-[var(--fondo-elevado)] px-3 py-2 text-nota text-[var(--texto-suave)]">Clasificación</div>
            <HuecoEnEsquema etiqueta="Entre bloques" formato="300 × 250 · competición" />
            <div className="rounded-[var(--radius-md)] bg-[var(--fondo-elevado)] px-3 py-2 text-nota text-[var(--texto-suave)]">Jornada</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-[1.3]">
            <div className="flex min-h-28 flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--borde-fuerte)] px-2 py-2 text-center">
              <span className="text-nota font-bold text-[var(--texto)]">Lateral</span>
              <span className="text-etiqueta text-[var(--texto-suave)]">300 × 600 · sólo escritorio</span>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--fondo-elevado)] px-3 py-2 text-nota text-[var(--texto-suave)]">Goleadores</div>
          </div>
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-nota text-[var(--texto-suave)]">
        <li>En móvil el lateral desaparece; en el resto de huecos, como mucho uno por pantalla.</li>
        <li>Un patrocinio directo usa estos mismos huecos: no hay un espacio reservado aparte para él.</li>
        <li>Un anuncio nunca va dentro de una tabla, un formulario ni una lista de partidos.</li>
      </ul>
    </section>
  );
}

/** Estado de cada hueco: hoy todos apagados. */
export function TablaDeEspacios() {
  return (
    <section aria-labelledby="espacios" className={`${TARJETA} overflow-hidden`}>
      <div className={MARGEN}>
        <h2 id="espacios" className="m-0 text-bloque font-bold text-[var(--texto)]">Espacios</h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
          Los siete huecos del sistema. Ninguno está contratado ni activo.
        </p>
      </div>
      <table className="w-full border-separate border-spacing-0 text-tabla">
        <caption className="sr-only">Huecos publicitarios, páginas, formato y estado.</caption>
        <thead>
          <tr className="text-etiqueta text-[var(--texto-suave)]">
            <th scope="col" className="py-2 pl-4 pr-1.5 text-left font-semibold">Hueco</th>
            <th scope="col" className="hidden px-1.5 py-2 text-left font-semibold sm:table-cell">Páginas</th>
            <th scope="col" className="hidden px-1.5 py-2 text-left font-semibold md:table-cell">Formato</th>
            <th scope="col" className="py-2 pl-1.5 pr-4 text-right font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody>
          {HUECOS_PUBLICITARIOS.map((hueco) => (
            <tr key={hueco.codigo}>
              <th scope="row" className="min-w-0 border-t border-[var(--fondo-sutil)] py-2 pl-4 pr-1.5 text-left font-semibold text-[var(--texto)]">
                <span className="block truncate">{hueco.nombre}</span>
                <span className="block truncate font-normal text-nota text-[var(--texto-suave)] sm:hidden">{hueco.paginas}</span>
              </th>
              <td className="hidden border-t border-[var(--fondo-sutil)] px-1.5 py-2 text-[var(--texto-suave)] sm:table-cell">{hueco.paginas}</td>
              <td className="hidden border-t border-[var(--fondo-sutil)] px-1.5 py-2 text-[var(--texto-suave)] md:table-cell">{hueco.formatoTexto}</td>
              <td className="border-t border-[var(--fondo-sutil)] py-2 pl-1.5 pr-4 text-right">
                <span className="inline-flex items-center rounded-full bg-[var(--fondo-sutil)] px-2 py-0.5 text-etiqueta font-semibold text-[var(--texto-suave)]">
                  Apagado
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
        Ningún hueco tiene proveedor de anuncios asignado. El estado se comprueba en el archivo de la
        plataforma; esta página no lee campañas porque no son datos públicos.
      </p>
    </section>
  );
}

/** Patrocinios directos: hoy no hay ninguno, y no se rellena con ejemplos. */
export function PatrociniosDirectos() {
  return (
    <section aria-labelledby="patrocinios" className={`${TARJETA} ${MARGEN} flex flex-col gap-2`}>
      <h2 id="patrocinios" className="m-0 text-bloque font-bold text-[var(--texto)]">Patrocinios directos</h2>
      <p className="m-0 text-dato font-extrabold text-[var(--texto)]">Sin espacios contratados</p>
      <p className="m-0 text-tabla text-[var(--texto-suave)]">
        No hay ninguna campaña activa ni patrocinio directo. Si algún día lo hubiera, llevaría la etiqueta
        «Publicidad» y enlazaría a la web del patrocinador; nunca se usaría para seguirte por otras páginas.
      </p>
      <p className="m-0 text-nota text-[var(--texto-suave)]">
        {ESTADO_DE_PUBLICIDAD.campanas} campañas · {ESTADO_DE_PUBLICIDAD.espaciosContratados} espacios contratados.
      </p>
    </section>
  );
}

/** Las reglas que se aplican al contenido y a las personas. */
export function ReglasDePublicidad() {
  return (
    <section aria-labelledby="reglas" className={`${TARJETA} ${MARGEN} flex flex-col gap-2`}>
      <h2 id="reglas" className="m-0 text-bloque font-bold text-[var(--texto)]">Reglas</h2>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-tabla text-[var(--texto)]">
        {REGLAS_DE_PUBLICIDAD.map((regla) => (
          <li key={regla} className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 size-1.5 flex-none rounded-full bg-[var(--accion)]" />
            <span>{regla}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lo que se exigirá antes de que haya anuncios: compromisos, no un estado interno. */
export function Requisitos() {
  return (
    <section aria-labelledby="requisitos" className={`${TARJETA} ${MARGEN} flex flex-col gap-2`}>
      <h2 id="requisitos" className="m-0 text-bloque font-bold text-[var(--texto)]">Antes de que haya anuncios</h2>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-tabla text-[var(--texto)]">
        {REQUISITOS_PARA_ANUNCIOS.map((requisito) => (
          <li key={requisito} className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 size-1.5 flex-none rounded-full bg-[var(--texto-tenue)]" />
            <span>{requisito}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-nota text-[var(--texto-suave)]">
        Hoy no se muestra ninguna publicidad. Esta lista es el compromiso para cuando se decida mostrarla.
      </p>
    </section>
  );
}

/** Enlace de vuelta a las competiciones, para no dejar la página sin salida. */
export function VolverALaWeb() {
  return (
    <p className="m-0 text-nota">
      <Link href={'/explorar/competiciones' as Route} className="font-semibold text-[var(--accion)] hover:underline">
        Volver a las competiciones
      </Link>
    </p>
  );
}
