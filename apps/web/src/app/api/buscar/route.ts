import { NextResponse } from 'next/server';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { BUSQUEDA_POR_NOMBRE } from '@/consultas/entidades';
import type { FilaBusqueda } from '@/consultas/entidades';
import { resultadoDeSugerencia } from '@/lib/sugerencias';

export const dynamic = 'force-dynamic';

/**
 * Sugerencias del cuadro de búsqueda de la cabecera.
 *
 * Antes esto recorría las dieciocho colas SQLite con `buscarGlobal`. Se sustituye por la misma
 * consulta canónica que usa `/buscar`, por tres motivos:
 *
 * 1. **Leer archivos federativos dentro de una petición de usuario** es lo que prohíbe
 *    ARQUITECTURA.md §7, y esto es lo que se ejecuta cada vez que alguien escribe dos letras.
 * 2. **La búsqueda global contra las colas tardaba 77,7 s medidos.** Una caja de sugerencias con ese
 *    coste detrás no es una caja de sugerencias.
 * 3. **Y decía menos**: el canónico devuelve clubes y jugadores con su federación y su contexto.
 *
 * El contrato de respuesta **no cambia** —`total` y `resultados[]` con `tipo`, `titulo`, `subtitulo`,
 * `meta` y `url`— para no tocar el componente que lo consume.
 *
 * Y una regla del proyecto que aquí se cumple a conciencia: **si el canónico no responde, esto NO
 * devuelve «sin resultados»**. Devolver una lista vacía con un 200 diría «no hay ningún club ni
 * jugador que se llame así», que es una afirmación falsa: lo que pasa es que no se ha podido
 * preguntar. Se devuelve 503 y el cuadro se queda sin desplegar, que es la verdad.
 *
 * La conversión de cada fila a sugerencia vive en `lib/sugerencias.ts`, donde también se aplica la
 * regla de los menores de edad (`es_menor`) y se puede probar sin base de datos. Aquí sólo se mapea.
 */

const SUGERENCIAS = 8;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const fed = (searchParams.get('fed') ?? searchParams.get('federacion') ?? '').trim();
  const federacion = !fed || fed === 'todas' ? null : fed;

  // Menos de dos letras no se busca: no es una búsqueda, es un recorrido.
  if (q.length < 2) {
    return NextResponse.json({ total: 0, cuenta: {}, resultados: [] });
  }

  const motivo = motivoSinCanonico();
  if (motivo) return NextResponse.json({ motivo }, { status: 503 });

  let filas: FilaBusqueda[] = [];
  try {
    filas = await consulta<FilaBusqueda>(BUSQUEDA_POR_NOMBRE.sql, [q, federacion, null, null, SUGERENCIAS]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return NextResponse.json({ motivo: error.message }, { status: 503 });
    throw error;
  }

  // `cuenta` cuenta los resultados DEVUELTOS, no el total: el total verdadero es `total`. La interfaz
  // no lo usa hoy, pero devolver una cifra que parezca el total sería una trampa para el que la use.
  const cuenta: Record<string, number> = {};
  for (const f of filas) cuenta[f.tipo] = (cuenta[f.tipo] ?? 0) + 1;

  return NextResponse.json({
    total: filas[0]?.total ?? 0,
    cuenta,
    resultados: filas.map(resultadoDeSugerencia),
  });
}
