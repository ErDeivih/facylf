import type { CSSProperties } from 'react';
import type { LineaCronologia } from '@/lib/acta';

/**
 * Cronología del acta: una línea por suceso.
 *
 * En escritorio se lee como el prototipo, con el equipo local a la izquierda y el visitante a la
 * derecha. En móvil (menos de 640 px) esa rejilla de tres columnas deja el nombre en 90 px y parte las
 * palabras, así que cada suceso pasa a una línea: minuto, icono, nombre y detalle con el lado escrito.
 * Son dos maquetaciones del MISMO contenido; la que no aplica está en `display:none`, así que un lector
 * de pantalla no la lee dos veces.
 *
 * Nunca se usa sólo el color ni sólo un icono: cada símbolo lleva su texto al lado (en la línea y en la
 * leyenda), así que una impresión en blanco y negro o una persona daltónica leen lo mismo.
 */
export function CronologiaActa({ lineas, cierre }: {
  lineas: readonly LineaCronologia[];
  /** Marca de cierre del acta («Final»), o `null` si el partido no está cerrado. */
  cierre: string | null;
}) {
  return (
    <section aria-labelledby="cronologia"
      className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
        <h2 id="cronologia" className="m-0 text-bloque font-bold text-[var(--texto)]">Cronología</h2>
        <span className="text-nota text-[var(--texto-suave)]">Local a la izquierda · visitante a la derecha</span>
      </div>
      {lineas.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            El acta de este partido no recoge eventos.
          </p>
        )
        : (
          <ol className="m-0 list-none px-0 pt-1 pb-3">
            {lineas.map((linea) => (
              <li key={linea.clave} className="border-t border-[var(--fondo-sutil)] first:border-t-0 sm:border-t-0">
                {/* Escritorio: local a la izquierda, visitante a la derecha. */}
                <div className="hidden min-h-11 grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center gap-2 px-3 sm:grid">
                  <div className="flex items-center justify-end gap-2 text-right">
                    {linea.lado === 'local' && (
                      <>
                        <Textos linea={linea} />
                        <Icono tipo={linea.tipo} />
                      </>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <Minuto texto={linea.minuto} />
                  </div>
                  <div className="flex items-center gap-2">
                    {linea.lado === 'visitante' && (
                      <>
                        <Icono tipo={linea.tipo} />
                        <Textos linea={linea} />
                      </>
                    )}
                  </div>
                </div>
                {/* Móvil: una sola línea por suceso, con el lado escrito. */}
                <div className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 sm:hidden">
                  <Minuto texto={linea.minuto} />
                  <Icono tipo={linea.tipo} />
                  <Textos linea={linea} conLado />
                </div>
              </li>
            ))}
            {cierre !== null && (
              <li className="flex justify-center px-3 pt-2">
                <span className="rounded-full bg-[var(--fondo-fuerte)] px-3 py-1 text-nota font-bold text-[var(--texto-fuerte)]">
                  {cierre}
                </span>
              </li>
            )}
          </ol>
        )}
      <Leyenda />
    </section>
  );
}

function Minuto({ texto }: { texto: string | null }) {
  if (texto === null) return <span className="sr-only">Sin minuto publicado</span>;
  return (
    <span className="tabular-nums flex-none rounded-full bg-[var(--fondo-sutil)] px-2 py-1 text-nota font-bold text-[var(--texto-suave)]">
      {texto}
    </span>
  );
}

function Textos({ linea, conLado = false }: { linea: LineaCronologia; conLado?: boolean }) {
  const lado = linea.lado === 'local' ? 'Local' : linea.lado === 'visitante' ? 'Visitante' : null;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="min-w-0 break-words text-tabla font-semibold text-[var(--texto)]">
        {conLado && lado !== null && <span className="sr-only">{lado}. </span>}
        {linea.quien}
      </span>
      <span className="text-nota text-[var(--texto-suave)]">
        {linea.detalle}
        {conLado && lado !== null ? ` · ${lado}` : ''}
      </span>
    </span>
  );
}

type TipoIcono = LineaCronologia['tipo'];

const ICONOS: Record<TipoIcono, { texto: string; clase: string; estilo?: CSSProperties }> = {
  gol: { texto: 'G', clase: 'size-6 rounded-full bg-[var(--fondo-fuerte)] text-etiqueta font-extrabold text-[var(--texto-fuerte)]' },
  penalti: { texto: 'P', clase: 'size-6 rounded-full bg-[var(--fondo-fuerte)] text-etiqueta font-extrabold text-[var(--texto-fuerte)]' },
  // En propia puerta se distingue por su texto («PP» y «En propia puerta»), no por el color: el rojo
  // brillante del prototipo con texto claro no llega a AA en tema oscuro, y un icono que sólo se
  // entiende por el color no sirve para una persona daltónica ni para una impresión en blanco y negro.
  propia: { texto: 'PP', clase: 'size-6 rounded-full bg-[var(--fondo-fuerte)] text-etiqueta font-extrabold text-[var(--texto-fuerte)]' },
  amarilla: { texto: '', clase: 'h-5 w-[15px] rounded-[3px] bg-[var(--amarilla)]' },
  'doble-amarilla': {
    texto: '',
    clase: 'h-5 w-[15px] rounded-[3px]',
    estilo: { background: 'linear-gradient(135deg, var(--amarilla) 50%, var(--roja) 50%)' },
  },
  roja: { texto: '', clase: 'h-5 w-[15px] rounded-[3px] bg-[var(--roja)]' },
  cambio: { texto: '⇅', clase: 'size-6 rounded-full bg-[var(--accion-suave)] text-tabla font-bold text-[var(--victoria)]' },
};

function Icono({ tipo }: { tipo: TipoIcono }) {
  const { texto, clase, estilo } = ICONOS[tipo];
  return (
    <span aria-hidden="true" style={estilo}
      className={`flex flex-none items-center justify-center ${clase}`}>
      {texto}
    </span>
  );
}

const LEYENDA: Array<{ tipo: TipoIcono; texto: string }> = [
  { tipo: 'gol', texto: 'Gol' },
  { tipo: 'penalti', texto: 'Penalti' },
  { tipo: 'propia', texto: 'En propia' },
  { tipo: 'amarilla', texto: 'Amarilla' },
  { tipo: 'doble-amarilla', texto: 'Doble amarilla' },
  { tipo: 'roja', texto: 'Roja' },
  { tipo: 'cambio', texto: 'Cambio' },
];

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-2 border-t border-[var(--fondo-sutil)] px-4 py-3 text-nota text-[var(--texto)]">
      {LEYENDA.map(({ tipo, texto }) => (
        <span key={tipo} className="flex items-center gap-1.5">
          <Icono tipo={tipo} />
          {texto}
        </span>
      ))}
    </div>
  );
}
