import Link from 'next/link';
import type { Route } from 'next';
import type { FilaActaCanonica } from '@/consultas/partidos';
import { Escudo } from '@/componentes/Escudo';
import { etiquetaEstado, fechaDeActa } from '@/lib/acta';
import { fechaDePartido } from '@/lib/jornadas';
import { marcadorDePartido } from '@/lib/pantalla-competicion';

/**
 * Cabecera del acta: la superficie oscura del prototipo con los dos equipos, el marcador y el contexto
 * del partido (fecha, hora y campo, sólo los que la federación publicó).
 *
 * Reglas que aplica:
 *  · sin marcador publicado no se pinta 0-0: se pinta «—» y se anuncia «sin resultado publicado»;
 *  · sin hora no hay hueco de hora, y sin campo no se enseña el campo;
 *  · el escudo es el real si el club lo tiene y, si no, el marcador de posición de `Escudo`; en los dos
 *    casos es decorativo y el nombre del equipo va como texto.
 *
 * El `<h1>` es el acta del partido (va oculto porque los equipos y el marcador ya se ven en grande); los
 * encabezados de las tarjetas son `h2`, de modo que la página tiene una sola jerarquía.
 */
export function CabeceraActa({ acta }: { acta: FilaActaCanonica }) {
  const marcador = marcadorDePartido({
    goles_local: acta.goles_local,
    goles_visitante: acta.goles_visitante,
    hora: null,
  });
  const estado = etiquetaEstado(acta.estado);
  const fecha = fechaDeActa(fechaDePartido(acta));
  const contexto = [
    fecha,
    (acta.hora ?? '').trim() !== '' ? acta.hora!.trim() : null,
    (acta.campo ?? '').trim() !== '' ? acta.campo!.trim() : null,
  ].filter((pieza): pieza is string => pieza !== null);
  const hayPenaltis = acta.penaltis_local !== null && acta.penaltis_visitante !== null;
  const escudo = '[&>svg]:h-[66px] [&>svg]:w-[60px] [&>img]:h-[66px] [&>img]:w-[60px]';

  return (
    <section aria-labelledby="acta"
      className="rounded-[var(--radius-tarjeta)] bg-[var(--fondo-fuerte)] px-5 pt-4 pb-5 text-[var(--texto-fuerte)]">
      <h1 id="acta" className="sr-only" title={`${acta.local} ${marcador.texto} ${acta.visitante}`}>
        Acta: {acta.local_nombre_corto ?? acta.local} {marcador.texto} {acta.visitante_nombre_corto ?? acta.visitante}
      </h1>

      {contexto.length > 0 && (
        <p className="m-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-nota text-[var(--texto-fuerte-suave)]">
          {contexto.map((pieza, i) => (
            <span key={`${i}-${pieza}`} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">·</span>}
              {pieza}
            </span>
          ))}
        </p>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span className={`flex items-center justify-center ${escudo}`}>
            <Escudo
              equipoId={acta.local_id}
              nombre={acta.local}
              clubId={acta.local_club_id}
              tieneEscudo={acta.local_tiene_escudo}
            />
          </span>
          <Link href={`/explorar/equipo/${acta.local_id}`}
            className="min-w-0 break-words text-center text-cuerpo font-bold leading-tight text-[var(--texto-fuerte)] hover:underline"
            title={acta.local}>
            <span className="sr-only">Local: </span>
            {acta.local_nombre_corto ?? acta.local}
          </Link>
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <span
            className={marcador.jugado
              ? 'tabular-nums text-[2.5rem] font-extrabold leading-none tracking-[-0.02em] text-[var(--texto-fuerte)]'
              : 'tabular-nums text-[2.5rem] font-extrabold leading-none tracking-[-0.02em] text-[var(--texto-fuerte-suave)]'}
            title={marcador.accesible}>
            {marcador.texto}
            <span className="sr-only">, {marcador.accesible}</span>
          </span>
          {estado !== null && (
            // El texto va en el color de tinta clara de la superficie fuerte en los DOS temas: teñir la
            // pastilla con el color del estado dejaba el texto «Final» verde oscuro sobre fondo oscuro
            // en tema claro (lo midió axe: 4,16:1). El color del estado queda en el punto, que es
            // decorativo, y el texto sigue diciendo lo mismo a quien no distingue colores.
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--texto-fuerte)]/15 px-2.5 py-0.5 text-nota font-bold text-[var(--texto-fuerte)]">
              <span aria-hidden="true"
                className={`size-1.5 rounded-full ${acta.estado === 'played' ? 'bg-[var(--victoria)]' : 'bg-[var(--texto-fuerte-suave)]'}`} />
              {estado}
            </span>
          )}
          {hayPenaltis && (
            <span className="tabular-nums text-nota text-[var(--texto-fuerte-suave)]">
              Penaltis {acta.penaltis_local}-{acta.penaltis_visitante}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span className={`flex items-center justify-center ${escudo}`}>
            <Escudo
              equipoId={acta.visitante_id}
              nombre={acta.visitante}
              clubId={acta.visitante_club_id}
              tieneEscudo={acta.visitante_tiene_escudo}
            />
          </span>
          <Link href={`/explorar/equipo/${acta.visitante_id}`}
            className="min-w-0 break-words text-center text-cuerpo font-bold leading-tight text-[var(--texto-fuerte)] hover:underline"
            title={acta.visitante}>
            <span className="sr-only">Visitante: </span>
            {acta.visitante_nombre_corto ?? acta.visitante}
          </Link>
        </div>
      </div>

      <p className="m-0 mt-4 text-center text-nota">
        <Link href={`/explorar/competicion/${acta.grupo_id}` as Route}
          className="text-[var(--texto-fuerte-suave)] hover:text-[var(--texto-fuerte)] hover:underline">
          Ver la competición
        </Link>
      </p>
    </section>
  );
}
