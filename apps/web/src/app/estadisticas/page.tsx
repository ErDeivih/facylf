import { Barras } from '@/componentes/Barras';
import { Bloque } from '@/componentes/Bloque';
import { datosFederacion, estadisticasLocales, federacionDesde, slugJugador } from '@/lib/repositorio-local';
import { SelectorFederacion } from '@/componentes/SelectorFederacion';

export const revalidate = 60;

export default async function Estadisticas({ searchParams }: { searchParams: Promise<{ federacion?: string }> }) {
  const federacion = federacionDesde((await searchParams).federacion);
  const datos = estadisticasLocales(federacion);
  return <>
    <p className="font-display text-xs uppercase tracking-[0.16em] text-club">Análisis del archivo local</p>
    <h2 className="mt-1 font-display text-3xl uppercase">Estadísticas</h2>
    <p className="mb-6 mt-2 max-w-3xl text-sm leading-6 text-[#5C646C]">
      Las tablas y gráficas de {datosFederacion(federacion).nombre} se recalculan con los partidos y actas disponibles. Los apartados se completan automáticamente conforme avanza la colección.
    </p>
    <SelectorFederacion federacion={federacion} action="/estadisticas" />
    <div className="grid gap-5 lg:grid-cols-2">
      <Bloque titulo="Equipos con más puntos" pie="Por temporada">
        <Barras datos={datos.equipos.map((e) => ({ etiqueta: e.nombre, valor: e.puntos,
          detalle: `${e.temporada} · ${e.competicion} · ${e.grupo} · ${e.partidos} PJ`, href: `/equipo/${e.slug}` }))} />
      </Bloque>
      <Bloque titulo="Máximos goleadores" pie="Actas analizadas; abre un perfil para separar temporada y equipo">
        <Barras unidad=" goles" datos={datos.goleadores.map((j) => ({ etiqueta: j.nombre, valor: j.goles,
          detalle: `${j.partidos} partidos`, href: `/jugador/${slugJugador(j.codigo, j.federacion)}` }))} />
      </Bloque>
      <Bloque titulo="Jugadores con más apariciones confirmadas" pie="Las convocatorias sin entrada no cuentan como partido jugado">
        <Barras unidad=" partidos" datos={datos.habituales.map((j) => ({ etiqueta: j.nombre, valor: j.partidos,
          detalle: `${j.titularidades} titularidades`, href: `/jugador/${slugJugador(j.codigo, j.federacion)}` }))} />
      </Bloque>
      <Bloque titulo="Árbitros con más partidos registrados">
        <Barras unidad=" partidos" datos={datos.arbitros.map((a) => ({ etiqueta: a.nombre, valor: a.partidos }))} />
      </Bloque>
      <Bloque titulo="Campos con más partidos registrados">
        <Barras unidad=" partidos" datos={datos.campos.map((c) => ({ etiqueta: c.nombre, valor: c.partidos }))} />
      </Bloque>
    </div>
  </>;
}
