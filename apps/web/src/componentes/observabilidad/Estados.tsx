import { Esqueleto } from '@/componentes/base';
import type { FilaEstados } from '@/consultas/observabilidad';
import { motivoDeEstado, type TipoDeEstadoVacio } from '@/lib/observabilidad-pantalla';
import { Seccion, TarjetaDeEstado } from './piezas';

/**
 * Secciones de la pantalla «Estados»: cómo se ve una pantalla cuando no hay datos.
 *
 * La página no inventa estados: cada ejemplo es un grupo REAL del canónico, y cada enlace lleva a la
 * pantalla real donde se ve ese estado. Los componentes que se enseñan (la tarjeta de vacío, el
 * esqueleto de carga) son los que usa la aplicación, no una maqueta aparte.
 */

const MOTIVOS: ReadonlyArray<{ tipo: TipoDeEstadoVacio }> = [
  { tipo: 'sin_resultado' },
  { tipo: 'sin_calendario' },
  { tipo: 'sin_actas' },
  { tipo: 'sin_cambios' },
];

/** Los cuatro motivos por los que una competición puede quedarse sin datos. */
export function MotivosDeCompeticion({ ejemplos }: { ejemplos: FilaEstados }) {
  const motivos = MOTIVOS
    .map(({ tipo }) => motivoDeEstado(tipo, ejemplos.datos[tipo]))
    .filter((motivo): motivo is NonNullable<typeof motivo> => motivo !== null);
  return (
    <Seccion id="motivos" titulo="Cuando una competición no tiene datos"
      entradilla="En el sitio de la sección vacía va una tarjeta que dice qué pasa y qué se puede hacer.">
      {motivos.length === 0
        ? (
          <p className="border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Ahora mismo no hay ejemplos reales de esos estados en Castilla y León.
          </p>
        )
        : (
          <div className="grid gap-3 px-4 py-3.5 md:grid-cols-2">
            {motivos.map((motivo) => (
              <TarjetaDeEstado
                key={motivo.tipo}
                chip={motivo.chip}
                titulo={motivo.titulo}
                motivo={motivo.motivo}
                href={motivo.href ?? undefined}
                textoEnlace="Ver la competición real"
              />
            ))}
          </div>
        )}
    </Seccion>
  );
}

/** El buscador: sin resultados y con demasiados resultados. */
export function EstadosDelBuscador() {
  return (
    <Seccion id="buscador" titulo="Buscador"
      entradilla="La búsqueda por nombre devuelve clubes y jugadores, y siempre dice cuántos hay.">
      <div className="grid gap-3 px-4 py-3.5 md:grid-cols-2">
        <TarjetaDeEstado
          chip="Sin resultados"
          titulo="Ningún nombre coincide"
          motivo="No hay nada con «pereira». Prueba con un solo apellido o quita la federación: el nombre se busca sin tildes y tolera erratas cortas."
          href="/buscar?q=pereira"
          textoEnlace="Probar la búsqueda real"
        />
        <TarjetaDeEstado
          chip="Muchos resultados"
          titulo="Un apellido muy común"
          motivo="La búsqueda devuelve como mucho 60 resultados y dice cuántos hay en total. Añade un apellido o una federación para acotar."
          href="/buscar?q=garcia"
          textoEnlace="Probar la búsqueda real"
        />
      </div>
    </Seccion>
  );
}

/** Carga, error y 404: las piezas reales con enlaces a pantallas reales. */
export function EstadosDeCargaYError() {
  return (
    <Seccion id="plataforma" titulo="Carga, error y página que no existe"
      entradilla="Lo mismo que aparece en la aplicación cuando algo tarda, falla o no existe.">
      <div className="grid gap-3 px-4 py-3.5 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4">
          <h3 className="m-0 text-bloque font-bold text-[var(--texto)]">Cargando</h3>
          <div className="border border-dashed border-[var(--borde-fuerte)] p-3">
            <p className="m-0 mb-2 text-tabla text-[var(--texto)]">
              Mientras carga se reserva el sitio con las mismas dimensiones: la página no salta al llegar los datos.
            </p>
            <Esqueleto filas={3} columnas={3} />
          </div>
          <a href="/explorar/estadisticas" className="text-tabla font-semibold text-[var(--accion)] hover:underline">
            Ver una pantalla que carga así
          </a>
        </div>

        <div className="flex flex-col gap-2 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4">
          <h3 className="m-0 text-bloque font-bold text-[var(--texto)]">Error</h3>
          <div role="alert" className="border border-dashed border-[var(--borde-fuerte)] p-3">
            <p className="m-0 text-tabla font-semibold text-[var(--texto)]">Ahora mismo no se pueden cargar estos datos.</p>
            <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
              Se dice y se ofrece reintentar; no se enseñan cifras a medias ni ceros que parezcan datos.
            </p>
          </div>
          <a href="/explorar/estadisticas" className="text-tabla font-semibold text-[var(--accion)] hover:underline">
            Ver la pantalla que lo enseña
          </a>
        </div>

        <div className="flex flex-col gap-2 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4">
          <h3 className="m-0 text-bloque font-bold text-[var(--texto)]">Página que no existe</h3>
          <div className="border border-dashed border-[var(--borde-fuerte)] p-3">
            <p className="m-0 text-tabla font-semibold text-[var(--texto)]">Esa página no existe.</p>
            <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
              Un identificador que no existe no enseña una página vacía: responde 404 y se puede volver.
            </p>
          </div>
          <a href="/explorar/competicion/999999999" className="text-tabla font-semibold text-[var(--accion)] hover:underline">
            Ver un 404 real
          </a>
        </div>
      </div>
    </Seccion>
  );
}
