import { formateaNumero, textoDeMinutos, type ResumenDeHistorial } from '@/lib/historial-jugador';

/**
 * Tarjetas de resumen del historial: temporadas, equipos, clubes, partidos, goles, minutos y disciplina.
 *
 * Sin historial no se pinta una rejilla de ceros: un cero se lee como «no pasó nada» y aquí lo que pasa
 * es que no hay actas publicadas. Se dice en una línea.
 */
export function ResumenHistorial({ resumen }: { resumen: ResumenDeHistorial }) {
  const tarjeta = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
  const etiqueta = 'text-etiqueta font-semibold uppercase tracking-[0.06em] text-[var(--texto-suave)]';

  if (resumen.temporadas === 0) {
    return (
      <section aria-labelledby="resumen-historial" className={`${tarjeta} px-4 py-3.5`}>
        <h2 id="resumen-historial" className="m-0 text-bloque font-bold text-[var(--texto)]">Resumen</h2>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">Sin datos de historial publicado.</p>
      </section>
    );
  }

  const minutos = textoDeMinutos({
    minutos: resumen.minutos,
    minutosFiables: resumen.minutosFiables,
    minutosEstimados: null,
  });

  const datos = [
    {
      clave: 'temporadas',
      etiqueta: 'Temporadas',
      valor: formateaNumero(resumen.temporadas),
      nota: resumen.temporadas === 1 ? 'Una temporada con actas' : 'Temporadas con actas',
    },
    {
      clave: 'equipos',
      etiqueta: 'Equipos',
      valor: formateaNumero(resumen.equipos),
      nota: resumen.clubes === 1 ? 'De un club' : `De ${formateaNumero(resumen.clubes)} clubes`,
    },
    {
      clave: 'partidos',
      etiqueta: 'Partidos',
      valor: formateaNumero(resumen.partidos),
      nota: `${formateaNumero(resumen.titularidades)} como titular`,
    },
    {
      clave: 'goles',
      etiqueta: 'Goles',
      valor: formateaNumero(resumen.goles),
      nota: 'Los de propia puerta no cuentan para él',
    },
    {
      clave: 'minutos',
      etiqueta: 'Minutos',
      valor: minutos,
      nota: resumen.minutosFiables ? 'Exactos, de todas sus actas' : 'Alguna acta no permite calcularlos',
    },
    {
      clave: 'disciplina',
      etiqueta: 'Disciplina',
      valor: `A ${formateaNumero(resumen.amarillas)} · R ${formateaNumero(resumen.rojas)}`,
      nota: 'Amarillas y rojas en las actas',
    },
  ] as const;

  return (
    <section aria-labelledby="resumen-historial" className="flex flex-col gap-3">
      <h2 id="resumen-historial" className="sr-only">Resumen del historial</h2>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        {datos.map((dato) => (
          <article key={dato.clave} className={`${tarjeta} flex flex-col gap-1 p-3.5`}>
            <span className={etiqueta}>{dato.etiqueta}</span>
            <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">{dato.valor}</span>
            <span className="text-nota leading-5 text-[var(--texto-suave)]">{dato.nota}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
