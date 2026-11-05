import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { API_VERSION, ENDPOINTS_PUBLICOS } from '../src/lib/api';
import { ETIQUETAS, etiquetasDerivadas } from '../src/lib/cache';
import { GET as getEstadisticas } from '../src/app/api/v1/estadisticas/competicion/[id]/route';
import { GET as getHistorialJugador } from '../src/app/api/v1/ficha/jugador/[id]/historial/route';
import { GET as getHistorialEquipo } from '../src/app/api/v1/ficha/equipo/[id]/historial/route';
import { GET as getHistorialClub } from '../src/app/api/v1/ficha/club/[id]/historial/route';
import { GET as getArbitro } from '../src/app/api/v1/oficiales/arbitro/[id]/route';
import { GET as getEntrenador } from '../src/app/api/v1/oficiales/entrenador/[id]/route';
import { GET as getDelegado } from '../src/app/api/v1/oficiales/delegado/[id]/route';

/**
 * Ampliación de la API v1 (WALL: estadísticas, historiales y oficiales).
 *
 * Mismo contrato que la API existente: sobre `{ api, datos, enlaces }`, ETag/304, caché pública y
 * errores con código. Aquí se defiende lo específico de la ampliación:
 *  · las rutas nuevas están anunciadas y ya no son «planeadas»;
 *  · ids inválidos son 400, recursos inexistentes 404, y las fichas de oficiales no existen si la
 *    persona no tiene ese papel (un jugador no es un árbitro);
 *  · las etiquetas de caché nuevas se invalidan con las señales que ya emite el proyector;
 *  · las respuestas son de datos públicos, sin campos de cuenta.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

/** Persona real con 144 apariciones y cambio de club a mitad de temporada. */
const JUGADOR = 1181455;
/** Inscripción real (equipo de la jornada 1 del grupo 3769). */
const EQUIPO = 17609;
/** Club real (C.D. Internacional Vista Alegre). */
const CLUB = 1495;
/** Árbitro principal real con nombre publicado. */
const ARBITRO = 657011;
/** Entrenador real. */
const ENTRENADOR = 1251791;
/** Delegado de equipo real (rol «Taldeko Delegatua»). */
const DELEGADO = 1072476;
/** Grupo real de CyL 2026-27 con partidos, eventos y goleadores. */
const GRUPO = 3769;

afterAll(async () => {
  await cierraCanonico();
});

function peticion(url: string, opciones: { headers?: Record<string, string> } = {}) {
  return new Request(`http://localhost:3000${url}`, { headers: opciones.headers });
}

async function llama(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
  url: string,
  params: Record<string, string>,
  opciones: { headers?: Record<string, string> } = {},
) {
  return handler(peticion(url, opciones), { params: Promise.resolve(params) });
}

type Envoltorio = {
  api?: { version?: string; recurso?: string };
  datos?: unknown;
  enlaces?: Record<string, string>;
  error?: { codigo: string; mensaje: string };
};

type CompeticionDatos = {
  competicion: { id: number; federacion: string; temporada: string };
  resumen: { partidos: number; con_resultado: number; goles: number };
  eventos: { tramos: unknown[]; tarjetas: unknown[] };
  goleadores: Array<{ persona_id: number }>;
};

async function json(respuesta: Response): Promise<Envoltorio> {
  return (await respuesta.json()) as Envoltorio;
}

/* ── Contrato estático ──────────────────────────────────────────────────────────────────────────── */

describe('la ampliación anuncia sus rutas y comparte el contrato vigente', () => {
  it('las rutas nuevas están en el índice como disponibles', () => {
    const disponibles = ENDPOINTS_PUBLICOS.filter((e) => e.estado === 'disponible').map((e) => e.ruta);
    for (const ruta of [
      '/api/v1/estadisticas/competicion/{id}',
      '/api/v1/ficha/jugador/{id}/historial',
      '/api/v1/ficha/equipo/{id}/historial',
      '/api/v1/ficha/club/{id}/historial',
      '/api/v1/oficiales/arbitro/{id}',
      '/api/v1/oficiales/entrenador/{id}',
      '/api/v1/oficiales/delegado/{id}',
    ]) {
      expect(disponibles, ruta).toContain(ruta);
    }
    expect(API_VERSION).toBe('v1');
  });

  it('las etiquetas de caché nuevas son las del proyector y de los recursos amplios', () => {
    expect(ETIQUETAS['resumen-de-estadísticas']!([GRUPO])).toEqual([`grupo:${GRUPO}`, 'estadisticas']);
    expect(ETIQUETAS['historial-de-jugador']!([JUGADOR])).toEqual([`persona:${JUGADOR}`, 'historiales']);
    expect(ETIQUETAS['historial-del-equipo']!([EQUIPO])).toEqual([`equipo:${EQUIPO}`, 'historiales']);
    expect(ETIQUETAS['historial-del-club']!([CLUB])).toEqual([`club:${CLUB}`, 'historiales']);
    for (const nombre of ['arbitro-por-id', 'entrenador-por-id', 'delegado-por-id']) {
      expect(ETIQUETAS[nombre]!([111])).toEqual(['persona:111', 'oficiales']);
    }
  });

  it('un grupo que cambia refresca estadísticas, historiales y oficiales', () => {
    const derivadas = etiquetasDerivadas(['grupo:3769']);
    expect(derivadas).toEqual(expect.arrayContaining(['estadisticas', 'historiales', 'oficiales']));
    const deEquipo = etiquetasDerivadas(['equipo:17609']);
    expect(deEquipo).toEqual(expect.arrayContaining(['historiales', 'oficiales']));
    expect(etiquetasDerivadas(['rankings'])).toEqual([]);
  });
});

/* ── Endpoints contra el canónico ─────────────────────────────────────────────────────────────── */

describe.skipIf(!hayCanonico)('API v1: estadísticas de una competición', () => {
  it('devuelve resumen, eventos y goleadores reales, con ETag y caché', async () => {
    const respuesta = await llama(getEstadisticas, `/api/v1/estadisticas/competicion/${GRUPO}`, { id: String(GRUPO) });
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('cache-control')).toContain('public');
    expect(respuesta.headers.get('etag')).toBeTruthy();
    expect(respuesta.headers.get('x-cache')).toBe('MISS');

    const cuerpo = (await json(respuesta)) as Envoltorio & { datos?: CompeticionDatos };
    expect(cuerpo.api).toEqual({ version: 'v1', recurso: 'estadisticas-competicion' });
    expect(cuerpo.datos!.competicion.id).toBe(GRUPO);
    expect(cuerpo.datos!.competicion.federacion).toBe('castilla-leon');
    expect(cuerpo.datos!.competicion.temporada).toBe('2026-27');
    expect(cuerpo.datos!.resumen.partidos).toBeGreaterThan(0);
    expect(cuerpo.datos!.resumen.goles).toBeGreaterThan(0);
    expect(Array.isArray(cuerpo.datos!.eventos.tramos)).toBe(true);
    expect(Array.isArray(cuerpo.datos!.eventos.tarjetas)).toBe(true);
    expect(cuerpo.datos!.goleadores.length).toBeGreaterThan(0);
    expect(cuerpo.enlaces?.web).toBe(`/explorar/competicion/${GRUPO}/estadisticas`);
  });

  it('400 para un id no numérico y 404 para un grupo inexistente', async () => {
    const invalido = await llama(getEstadisticas, '/api/v1/estadisticas/competicion/abc', { id: 'abc' });
    expect(invalido.status).toBe(400);
    expect((await json(invalido)).error?.codigo).toBe('id_invalido');

    const inexistente = await llama(getEstadisticas, '/api/v1/estadisticas/competicion/999999999', { id: '999999999' });
    expect(inexistente.status).toBe(404);
    expect((await json(inexistente)).error?.codigo).toBe('no_encontrado');
    expect(inexistente.headers.get('cache-control')).toBe('no-store');
  });

  it('304 con If-None-Match', async () => {
    const primera = await llama(getEstadisticas, `/api/v1/estadisticas/competicion/${GRUPO}`, { id: String(GRUPO) });
    const etag = primera.headers.get('etag')!;
    const segunda = await llama(getEstadisticas, `/api/v1/estadisticas/competicion/${GRUPO}`,
      { id: String(GRUPO) }, { headers: { 'if-none-match': etag } });
    expect(segunda.status).toBe(304);
    expect(await segunda.text()).toBe('');
  });
});

describe.skipIf(!hayCanonico)('API v1: historiales', () => {
  it('jugador: devuelve todas sus apariciones (1181455, 144)', async () => {
    const respuesta = await llama(getHistorialJugador, `/api/v1/ficha/jugador/${JUGADOR}/historial`, { id: String(JUGADOR) });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await json(respuesta)) as Envoltorio & {
      datos?: { persona_id: number; apariciones: Array<{ team_entry_id: number; fecha: string | null }> };
    };
    expect(cuerpo.api?.recurso).toBe('historial-jugador');
    expect(cuerpo.datos!.persona_id).toBe(JUGADOR);
    expect(cuerpo.datos!.apariciones).toHaveLength(144);
    expect(cuerpo.datos!.apariciones.every((a) => typeof a.team_entry_id === 'number')).toBe(true);
    expect(cuerpo.enlaces?.web).toBe(`/explorar/jugador/${JUGADOR}/historial`);

    const invalido = await llama(getHistorialJugador, '/api/v1/ficha/jugador/abc/historial', { id: 'abc' });
    expect(invalido.status).toBe(400);
    const inexistente = await llama(getHistorialJugador, '/api/v1/ficha/jugador/999999999/historial', { id: '999999999' });
    expect(inexistente.status).toBe(404);
  });

  it('equipo: devuelve la línea temporada a temporada y 404 si no existe', async () => {
    const respuesta = await llama(getHistorialEquipo, `/api/v1/ficha/equipo/${EQUIPO}/historial`, { id: String(EQUIPO) });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await json(respuesta)) as Envoltorio & {
      datos?: Array<{ equipo_id: number; equipo: string; temporada: string }>;
    };
    expect(cuerpo.api?.recurso).toBe('historial-equipo');
    expect(Array.isArray(cuerpo.datos)).toBe(true);
    expect(cuerpo.datos!.length).toBeGreaterThan(0);
    expect(cuerpo.datos![0]!.equipo_id).toBe(EQUIPO);
    expect(cuerpo.datos!.every((f) => typeof f.temporada === 'string')).toBe(true);
    expect(cuerpo.enlaces?.web).toBe(`/explorar/equipo/${EQUIPO}/historial`);

    expect((await llama(getHistorialEquipo, '/api/v1/ficha/equipo/999999999/historial', { id: '999999999' })).status).toBe(404);
  });

  it('club: devuelve sus equipos y 404 si no existe', async () => {
    const respuesta = await llama(getHistorialClub, `/api/v1/ficha/club/${CLUB}/historial`, { id: String(CLUB) });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await json(respuesta)) as Envoltorio & {
      datos?: Array<{ club_id: number; club: string; equipo_id: number | null }>;
    };
    expect(cuerpo.api?.recurso).toBe('historial-club');
    expect(Array.isArray(cuerpo.datos)).toBe(true);
    expect(cuerpo.datos!.length).toBeGreaterThan(0);
    expect(cuerpo.datos![0]!.club_id).toBe(CLUB);
    expect(cuerpo.enlaces?.web).toBe(`/explorar/club/${CLUB}/historial`);

    expect((await llama(getHistorialClub, '/api/v1/ficha/club/999999999/historial', { id: '999999999' })).status).toBe(404);
  });
});

describe.skipIf(!hayCanonico)('API v1: fichas de oficiales', () => {
  it('árbitro: ficha real; un jugador no es árbitro (404) y un id malo es 400', async () => {
    const respuesta = await llama(getArbitro, `/api/v1/oficiales/arbitro/${ARBITRO}`, { id: String(ARBITRO) });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await json(respuesta)) as Envoltorio & { datos?: { person_id: number; partidos: number } };
    expect(cuerpo.api?.recurso).toBe('arbitro');
    expect(cuerpo.datos!.person_id).toBe(ARBITRO);
    expect(cuerpo.datos!.partidos).toBeGreaterThan(0);
    expect(cuerpo.enlaces?.web).toBe(`/explorar/arbitro/${ARBITRO}`);

    // 1181455 aparece en actas como jugador, no como árbitro principal.
    expect((await llama(getArbitro, '/api/v1/oficiales/arbitro/1181455', { id: '1181455' })).status).toBe(404);
    expect((await llama(getArbitro, '/api/v1/oficiales/arbitro/abc', { id: 'abc' })).status).toBe(400);
  });

  it('entrenador y delegado: fichas reales y 404 con un id inexistente', async () => {
    const entrenador = await llama(getEntrenador, `/api/v1/oficiales/entrenador/${ENTRENADOR}`, { id: String(ENTRENADOR) });
    expect(entrenador.status).toBe(200);
    const cuerpoEntrenador = (await json(entrenador)) as Envoltorio & { datos?: { person_id: number; partidos: number } };
    expect(cuerpoEntrenador.api?.recurso).toBe('entrenador');
    expect(cuerpoEntrenador.datos!.person_id).toBe(ENTRENADOR);
    expect(cuerpoEntrenador.datos!.partidos).toBeGreaterThan(0);
    expect(cuerpoEntrenador.enlaces?.web).toBe(`/explorar/entrenador/${ENTRENADOR}`);

    const delegado = await llama(getDelegado, `/api/v1/oficiales/delegado/${DELEGADO}`, { id: String(DELEGADO) });
    expect(delegado.status).toBe(200);
    const cuerpoDelegado = (await json(delegado)) as Envoltorio & { datos?: { person_id: number; partidos: number } };
    expect(cuerpoDelegado.api?.recurso).toBe('delegado');
    expect(cuerpoDelegado.datos!.person_id).toBe(DELEGADO);
    expect(cuerpoDelegado.datos!.partidos).toBeGreaterThan(0);
    expect(cuerpoDelegado.enlaces?.web).toBe(`/explorar/delegado/${DELEGADO}`);

    for (const handler of [getEntrenador, getDelegado]) {
      expect((await llama(handler, '/api/v1/oficiales/x/999999999', { id: '999999999' })).status).toBe(404);
    }
  });
});

describe.skipIf(!hayCanonico)('la ampliación no expone datos de cuenta', () => {
  it('ninguna respuesta nueva contiene campos de sesión, favoritos ni avisos', async () => {
    const respuestas = await Promise.all([
      llama(getEstadisticas, `/api/v1/estadisticas/competicion/${GRUPO}`, { id: String(GRUPO) }),
      llama(getHistorialJugador, `/api/v1/ficha/jugador/${JUGADOR}/historial`, { id: String(JUGADOR) }),
      llama(getArbitro, `/api/v1/oficiales/arbitro/${ARBITRO}`, { id: String(ARBITRO) }),
    ]);
    for (const respuesta of respuestas) {
      const texto = (await respuesta.text()).toLowerCase();
      for (const prohibido of ['usuario', 'favorito', 'sesion', 'password', 'token', 'aviso', 'notificacion']) {
        expect(texto, `la API pública no debe contener «${prohibido}»`).not.toContain(`"${prohibido}`);
      }
    }
  });
});
