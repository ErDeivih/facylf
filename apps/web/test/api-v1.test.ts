import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cierraCanonico, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { ETIQUETAS, etiquetasDerivadas, cacheado } from '../src/lib/cache';
import {
  API_VERSION, ENDPOINTS_PUBLICOS, etagCoincide, respuestaJson, errorApi, conLimiteDePeticiones,
  ipDePeticion, CABECERA_CACHE_PUBLICA, sobreRecurso,
} from '../src/lib/api';
import { leeFiltrosCalendarioApi, idDeApi } from '../src/lib/api-datos';
import { LIMITE_POR_MINUTO, limitePorIp, reiniciaLimitesApi } from '../src/lib/limite-api';
import { GET as getIndice } from '../src/app/api/v1/route';
import { GET as getCompeticion } from '../src/app/api/v1/competiciones/[id]/route';
import { GET as getActa } from '../src/app/api/v1/acta/[id]/route';
import { GET as getCalendario } from '../src/app/api/v1/calendario/route';
import { GET as getEquipo } from '../src/app/api/v1/ficha/equipo/[id]/route';
import { GET as getJugador } from '../src/app/api/v1/ficha/jugador/[id]/route';
import { GET as getClub } from '../src/app/api/v1/ficha/club/[id]/route';
import { POST as postRevalidar } from '../src/app/api/revalidar/route';

/**
 * Contrato de la API pública v1 (WALL objetivo 6).
 *
 * Lo que se defiende:
 *  · versión y envoltorio estables (`api.version`, `datos`, `enlaces`) y errores con código;
 *  · 400 para parámetros inválidos, 404 para recursos que no existen, 429 para el límite de peticiones;
 *  · ETag/If-None-Match con 304 y cabeceras de caché pública, nunca `no-store` en un 200 público;
 *  · una respuesta pública JAMÁS lleva datos de cuenta (esta API no importa las consultas de usuario);
 *  · las etiquetas de caché y su invalidación derivada están declaradas y se pueden probar sin Next.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

afterAll(async () => {
  await cierraCanonico();
});

/** Llama a un route handler con una URL y un contexto de parámetros como los de Next. */
function peticion(url: string, opciones: { headers?: Record<string, string>; method?: string; body?: string } = {}) {
  return new Request(`http://localhost:3000${url}`, {
    method: opciones.method ?? 'GET',
    headers: opciones.headers,
    body: opciones.body,
  });
}

async function llama(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
  url: string,
  params: Record<string, string> = {},
  opciones: { headers?: Record<string, string> } = {},
) {
  return handler(peticion(url, opciones), { params: Promise.resolve(params) });
}

function jsonDe(respuesta: Response): Promise<unknown> {
  return respuesta.json();
}

type Envoltorio = {
  api?: { version?: string; recurso?: string };
  datos?: unknown;
  enlaces?: Record<string, string>;
  filtros?: unknown;
  paginacion?: { pagina: number; porPagina: number; hayMas: boolean };
  error?: { codigo: string; mensaje: string };
};

/* ── Piezas puras ───────────────────────────────────────────────────────────────────────────────── */

describe('contrato de la API: envoltorio, ETag y errores', () => {
  it('la versión es v1 y el índice declara todos los endpoints públicos', () => {
    expect(API_VERSION).toBe('v1');
    const rutas = ENDPOINTS_PUBLICOS.map((e) => e.ruta);
    expect(rutas).toContain('/api/v1/competiciones/{id}');
    expect(rutas).toContain('/api/v1/acta/{id}');
    expect(rutas).toContain('/api/v1/calendario');
    expect(rutas).toContain('/api/v1/ficha/equipo/{id}');
    expect(rutas).toContain('/api/v1/ficha/jugador/{id}');
    expect(rutas).toContain('/api/v1/ficha/club/{id}');
    // El contrato puede anunciar lo que aún no existe (objetivo 5), pero marcado como planeado.
    expect(ENDPOINTS_PUBLICOS.every((e) => e.estado === 'disponible' || e.estado === 'planeado')).toBe(true);
  });

  it('un id de URL sólo vale si es un entero positivo', () => {
    expect(idDeApi('3769')).toBe(3769);
    expect(idDeApi('0')).toBeNull();
    expect(idDeApi('-1')).toBeNull();
    expect(idDeApi('4.5')).toBeNull();
    expect(idDeApi('abc')).toBeNull();
    expect(idDeApi(undefined)).toBeNull();
  });

  it('la respuesta lleva ETag estable, caché pública y X-Cache', async () => {
    const datos = { api: { version: 'v1', recurso: 'prueba' }, datos: { a: 1 } };
    const primera = respuestaJson(datos, peticion('/api/v1/prueba'), { origen: 'calculado' });
    expect(primera.status).toBe(200);
    expect(primera.headers.get('content-type')).toContain('application/json');
    expect(primera.headers.get('x-content-type-options')).toBe('nosniff');
    expect(primera.headers.get('cache-control')).toBe(CABECERA_CACHE_PUBLICA);
    expect(primera.headers.get('x-cache')).toBe('MISS');
    const etag = primera.headers.get('etag');
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{16,}"$/);

    // El mismo cuerpo da el mismo ETag; otro cuerpo, otro.
    const segunda = respuestaJson(datos, peticion('/api/v1/prueba'), { origen: 'cache' });
    expect(segunda.headers.get('etag')).toBe(etag);
    expect(segunda.headers.get('x-cache')).toBe('HIT');
    const otro = respuestaJson({ ...datos, datos: { a: 2 } }, peticion('/api/v1/prueba'), { origen: 'cache' });
    expect(otro.headers.get('etag')).not.toBe(etag);

    // If-None-Match con ese ETag → 304 sin cuerpo y con las mismas cabeceras de caché.
    const tercera = respuestaJson(datos, peticion('/api/v1/prueba', { headers: { 'if-none-match': etag! } }), { origen: 'cache' });
    expect(tercera.status).toBe(304);
    expect(await tercera.text()).toBe('');
    expect(tercera.headers.get('etag')).toBe(etag);
    expect(tercera.headers.get('cache-control')).toBe(CABECERA_CACHE_PUBLICA);
  });

  it('If-None-Match admite listas y la forma débil W/', () => {
    const etag = '"abc123"';
    expect(etagCoincide(etag, etag)).toBe(true);
    expect(etagCoincide(`"otro", ${etag}`, etag)).toBe(true);
    expect(etagCoincide(`W/${etag}`, etag)).toBe(true);
    expect(etagCoincide('*', etag)).toBe(true);
    expect(etagCoincide('"nada"', etag)).toBe(false);
    expect(etagCoincide(null, etag)).toBe(false);
  });

  /**
   * Un `timestamptz` llega del driver como `Date` cuando la consulta se calcula y como cadena ISO
   * cuando sale de `unstable_cache`. Si el ETag cambia entre los dos caminos, el cliente recibe un 200
   * con cuerpo distinto cada vez que la entrada caduca: se midió en la primera pasada (competición,
   * equipo y club daban 0/8 condicionales porque el ETag de la caché no coincidía con el del cálculo).
   */
  it('una fecha de PostgreSQL (Date) se serializa igual venga de la caché o del cálculo', async () => {
    const cuerpoDate = respuestaJson(
      sobreRecurso('prueba', { calculado_en: new Date('2026-11-05T10:00:00.000Z') }, {}),
      peticion('/api/v1/prueba'),
      { origen: 'calculado' },
    );
    const cuerpoCache = respuestaJson(
      sobreRecurso('prueba', { calculado_en: '2026-11-05T10:00:00.000Z' }, {}),
      peticion('/api/v1/prueba'),
      { origen: 'cache' },
    );
    expect(await cuerpoDate.text()).toBe(await cuerpoCache.text());
    expect(cuerpoDate.headers.get('etag')).toBe(cuerpoCache.headers.get('etag'));
  });

  it('los errores llevan código, mensaje y no se cachean', async () => {
    const respuesta = errorApi(404, 'no_encontrado', 'No existe el recurso pedido.');
    expect(respuesta.status).toBe(404);
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    const cuerpo = (await jsonDe(respuesta)) as Envoltorio;
    expect(cuerpo.api?.version).toBe('v1');
    expect(cuerpo.error).toEqual({ codigo: 'no_encontrado', mensaje: 'No existe el recurso pedido.' });
    expect(cuerpo).not.toHaveProperty('datos');
  });

  it('el límite por IP permite 300 peticiones por minuto y luego responde 429', () => {
    reiniciaLimitesApi();
    const ahora = Date.UTC(2026, 10, 5, 12, 0, 0);
    for (let i = 0; i < LIMITE_POR_MINUTO; i++) {
      expect(limitePorIp('1.2.3.4', ahora).permitido, `petición ${i + 1}`).toBe(true);
    }
    const bloqueada = limitePorIp('1.2.3.4', ahora);
    expect(bloqueada.permitido).toBe(false);
    if (!bloqueada.permitido) expect(bloqueada.retryAfterSegundos).toBeGreaterThan(0);
    // Otra IP no está afectada y la ventana se reabre al pasar el minuto.
    expect(limitePorIp('5.6.7.8', ahora).permitido).toBe(true);
    expect(limitePorIp('1.2.3.4', ahora + 61_000).permitido).toBe(true);
    reiniciaLimitesApi();
  });

  it('la IP de la petición sale de x-forwarded-for sin inventarla', () => {
    expect(ipDePeticion(peticion('/x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } }))).toBe('9.9.9.9');
    expect(ipDePeticion(peticion('/x'))).toBe('desconocida');
  });

  it('el limitador se puede aplicar a una petición concreta y responde 429 con Retry-After', async () => {
    reiniciaLimitesApi();
    for (let i = 0; i < LIMITE_POR_MINUTO; i++) limitePorIp('8.8.8.8');
    const bloqueo = conLimiteDePeticiones(peticion('/api/v1/acta/1', { headers: { 'x-forwarded-for': '8.8.8.8' } }));
    expect(bloqueo).not.toBeNull();
    expect(bloqueo!.status).toBe(429);
    expect(bloqueo!.headers.get('retry-after')).toBeTruthy();
    expect(bloqueo!.headers.get('cache-control')).toBe('no-store');
    const cuerpo = (await jsonDe(bloqueo!)) as Envoltorio;
    expect(cuerpo.error?.codigo).toBe('demasiadas_peticiones');
    reiniciaLimitesApi();
  });
});

describe('filtros del calendario en la API', () => {
  it('acepta los parámetros documentados y normaliza la paginación', () => {
    const leidos = leeFiltrosCalendarioApi(new URLSearchParams(
      'federacion=castilla-leon&temporada=2026-27&jornada=4&desde=2026-09-01&hasta=2026-09-30&texto=burgos&pagina=2&porPagina=30'));
    expect(leidos.ok).toBe(true);
    if (leidos.ok) {
      expect(leidos.filtros).toMatchObject({
        federacion: 'castilla-leon', temporada: '2026-27', jornada: 4,
        desde: '2026-09-01', hasta: '2026-09-30', texto: 'burgos', pagina: 2, porPagina: 30,
      });
      expect(leidos.filtros.desplazamiento).toBe(30);
    }
  });

  it('sin filtros usa la primera página de 60', () => {
    const leidos = leeFiltrosCalendarioApi(new URLSearchParams(''));
    expect(leidos.ok).toBe(true);
    if (leidos.ok) expect(leidos.filtros).toMatchObject({ pagina: 1, porPagina: 60, desplazamiento: 0 });
  });

  it('un parámetro inválido es un 400 con su mensaje, no se ignora en silencio', () => {
    const casos: Array<[string, string]> = [
      ['federacion=Castilla Leon!', 'federacion'],
      ['temporada=2026/27', 'temporada'],
      ['jornada=cero', 'jornada'],
      ['jornada=0', 'jornada'],
      ['desde=2026-02-31', 'desde'],
      ['hasta=mañana', 'hasta'],
      ['pagina=0', 'pagina'],
      ['porPagina=500', 'porPagina'],
      ['texto=' + 'x'.repeat(81), 'texto'],
    ];
    for (const [consulta, campo] of casos) {
      const leidos = leeFiltrosCalendarioApi(new URLSearchParams(consulta));
      expect(leidos.ok, `${consulta} debería rechazarse`).toBe(false);
      if (!leidos.ok) expect(leidos.parametro).toBe(campo);
    }
  });
});

describe('caché por etiquetas', () => {
  it('las etiquetas de cada recurso son las que emite el proyector', () => {
    expect(ETIQUETAS['grupo-por-id']([3769])).toEqual(['grupo:3769']);
    expect(ETIQUETAS['equipo-por-id']([17609])).toEqual(['equipo:17609']);
    expect(ETIQUETAS['persona-por-id']([19062])).toEqual(['persona:19062']);
    expect(ETIQUETAS['club-por-id']([1495])).toEqual(['club:1495']);
    expect(ETIQUETAS['acta-del-partido']([94040])).toEqual(['acta']);
    expect(ETIQUETAS['partidos-del-calendario']([])).toEqual(['calendario']);
  });

  it('un grupo que cambia invalida también calendario y actas (caché amplia pero correcta)', () => {
    expect(etiquetasDerivadas(['grupo:3769'])).toEqual(expect.arrayContaining(['calendario', 'acta']));
    expect(etiquetasDerivadas(['equipo:17609'])).toEqual(expect.arrayContaining(['calendario', 'acta']));
    expect(etiquetasDerivadas(['persona:19062'])).toEqual(expect.arrayContaining(['calendario', 'acta']));
    // Una etiqueta que no cambia partidos no arrastra el calendario.
    expect(etiquetasDerivadas(['rankings'])).toEqual([]);
    expect(etiquetasDerivadas(['todo'])).toEqual([]);
  });

  it('sin contexto de Next (pruebas/scripts) se calcula y se dice que no es caché', async () => {
    const resultado = await cacheado(['prueba'], ['prueba'], async () => ({ n: 1 }));
    expect(resultado.datos).toEqual({ n: 1 });
    expect(resultado.origen).toBe('calculado');
  });
});

/* ── Endpoints ──────────────────────────────────────────────────────────────────────────────────── */

describe.skipIf(!hayCanonico)('API v1 contra el canónico', () => {
  beforeEach(() => reiniciaLimitesApi());

  it('GET /api/v1 devuelve el índice con versión y endpoints', async () => {
    const respuesta = await getIndice(peticion('/api/v1'));
    expect(respuesta.status).toBe(200);
    const cuerpo = (await jsonDe(respuesta)) as Envoltorio & { endpoints?: unknown[] };
    expect(cuerpo.api?.version).toBe('v1');
    expect(Array.isArray(cuerpo.endpoints)).toBe(true);
    expect(respuesta.headers.get('cache-control')).toContain('public');
  });

  it('GET /api/v1/competiciones/3769: contexto y cobertura reales', async () => {
    const respuesta = await llama(getCompeticion, '/api/v1/competiciones/3769', { id: '3769' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('cache-control')).toBe(CABECERA_CACHE_PUBLICA);
    expect(respuesta.headers.get('x-cache')).toBe('MISS');
    expect(respuesta.headers.get('etag')).toBeTruthy();
    const cuerpo = (await jsonDe(respuesta)) as Envoltorio & { datos?: Record<string, unknown> };
    expect(cuerpo.api?.version).toBe('v1');
    expect(cuerpo.api?.recurso).toBe('competicion');
    expect(cuerpo.datos?.grupo_id).toBe(3769);
    expect(cuerpo.datos?.grupo).toBe('Primera - III');
    expect(cuerpo.datos?.temporada).toBe('2026-27');
    expect(cuerpo.enlaces?.web).toBe('/explorar/competicion/3769');
  });

  it('GET /api/v1/competiciones/abc responde 400 y un id inexistente 404', async () => {
    const invalido = await llama(getCompeticion, '/api/v1/competiciones/abc', { id: 'abc' });
    expect(invalido.status).toBe(400);
    expect(((await jsonDe(invalido)) as Envoltorio).error?.codigo).toBe('id_invalido');

    const inexistente = await llama(getCompeticion, '/api/v1/competiciones/999999999', { id: '999999999' });
    expect(inexistente.status).toBe(404);
    expect(((await jsonDe(inexistente)) as Envoltorio).error?.codigo).toBe('no_encontrado');
    expect(inexistente.headers.get('cache-control')).toBe('no-store');
  });

  it('el 304 por ETag funciona en un endpoint real', async () => {
    const primera = await llama(getCompeticion, '/api/v1/competiciones/3769', { id: '3769' });
    const etag = primera.headers.get('etag');
    expect(etag).toBeTruthy();
    const segunda = await llama(getCompeticion, '/api/v1/competiciones/3769', { id: '3769' },
      { headers: { 'if-none-match': etag! } });
    expect(segunda.status).toBe(304);
    expect(await segunda.text()).toBe('');
  });

  it('GET /api/v1/acta/94040 trae el acta completa y 404 si no hay acta', async () => {
    const respuesta = await llama(getActa, '/api/v1/acta/94040', { id: '94040' });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await jsonDe(respuesta)) as Envoltorio & { datos?: Record<string, unknown> };
    expect(cuerpo.api?.recurso).toBe('acta');
    expect(cuerpo.datos?.match_id).toBe(94040);
    expect(cuerpo.datos?.calidad_acta).toBe('correct');
    expect(Array.isArray(cuerpo.datos?.eventos)).toBe(true);
    expect(Array.isArray(cuerpo.datos?.alineaciones)).toBe(true);
    expect(cuerpo.enlaces?.web).toBe('/explorar/acta/94040');

    // Partido sin acta (940046) y acta comprobada como no disponible (453933).
    for (const id of ['940046', '453933']) {
      const sinActa = await llama(getActa, `/api/v1/acta/${id}`, { id });
      expect(sinActa.status, `acta ${id}`).toBe(404);
    }
    const invalido = await llama(getActa, '/api/v1/acta/abc', { id: 'abc' });
    expect(invalido.status).toBe(400);
  });

  it('GET /api/v1/calendario pagina y filtra de verdad', async () => {
    const respuesta = await llama(getCalendario,
      '/api/v1/calendario?federacion=castilla-leon&temporada=2026-27&porPagina=5',
      {}, { headers: {} });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await jsonDe(respuesta)) as Envoltorio & {
      datos?: Array<Record<string, unknown>>;
      paginacion?: { pagina: number; porPagina: number; hayMas: boolean };
      filtros?: Record<string, unknown>;
    };
    expect(cuerpo.api?.recurso).toBe('calendario');
    expect(cuerpo.filtros).toMatchObject({ federacion: 'castilla-leon', temporada: '2026-27' });
    expect(cuerpo.paginacion).toMatchObject({ pagina: 1, porPagina: 5 });
    expect(cuerpo.datos!.length).toBeLessThanOrEqual(5);
    expect(cuerpo.datos!.length).toBeGreaterThan(0);
    for (const partido of cuerpo.datos!) expect(partido.federacion).toBe('castilla-leon');
  });

  it('el calendario rechaza filtros mal formados con 400', async () => {
    for (const consulta of ['jornada=abc', 'desde=2026-02-31', 'porPagina=500', 'federacion=a b']) {
      const respuesta = await llama(getCalendario, `/api/v1/calendario?${consulta}`);
      expect(respuesta.status, consulta).toBe(400);
      expect(((await jsonDe(respuesta)) as Envoltorio).error?.codigo).toBe('parametro_invalido');
    }
  });

  it('GET /api/v1/ficha/equipo/17609 devuelve equipo, plantilla y partidos', async () => {
    const respuesta = await llama(getEquipo, '/api/v1/ficha/equipo/17609', { id: '17609' });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await jsonDe(respuesta)) as Envoltorio & { datos?: Record<string, unknown> };
    expect(cuerpo.api?.recurso).toBe('ficha-equipo');
    expect(cuerpo.datos?.equipo).toBeTruthy();
    expect(Array.isArray(cuerpo.datos?.plantilla)).toBe(true);
    expect(Array.isArray(cuerpo.datos?.partidos)).toBe(true);
    expect(cuerpo.enlaces?.web).toBe('/explorar/equipo/17609');
    const inexistente = await llama(getEquipo, '/api/v1/ficha/equipo/999999999', { id: '999999999' });
    expect(inexistente.status).toBe(404);
  });

  it('GET /api/v1/ficha/jugador/19062 y /api/v1/ficha/club/1495 devuelven sus fichas', async () => {
    const jugador = await llama(getJugador, '/api/v1/ficha/jugador/19062', { id: '19062' });
    expect(jugador.status).toBe(200);
    const cuerpoJugador = (await jsonDe(jugador)) as Envoltorio & { datos?: Record<string, unknown> };
    expect(cuerpoJugador.api?.recurso).toBe('ficha-jugador');
    expect(cuerpoJugador.datos?.persona).toBeTruthy();
    expect(Array.isArray(cuerpoJugador.datos?.trayectoria)).toBe(true);

    const club = await llama(getClub, '/api/v1/ficha/club/1495', { id: '1495' });
    expect(club.status).toBe(200);
    const cuerpoClub = (await jsonDe(club)) as Envoltorio & { datos?: Record<string, unknown> };
    expect(cuerpoClub.api?.recurso).toBe('ficha-club');
    expect(cuerpoClub.datos?.club).toBeTruthy();
    expect(Array.isArray(cuerpoClub.datos?.equipos)).toBe(true);
  });

  it('POST /api/revalidar exige secreto y consume la cola de etiquetas', async () => {
    const sinSecreto = await postRevalidar(peticion('/api/revalidar', { method: 'POST' }));
    expect([401, 503]).toContain(sinSecreto.status);

    const secreto = (process.env.REVALIDACION_SECRETO ?? '').trim();
    if (secreto === '') return; // sin secreto configurado no hay forma de probar el camino bueno
    // `maximo=0` comprueba la operación de punta a punta (secreto, consulta al canónico y respuesta)
    // SIN consumir la cola real: consumirla desde una prueba mutaría el canónico compartido.
    const respuesta = await postRevalidar(peticion('/api/revalidar?maximo=0', {
      method: 'POST',
      headers: { authorization: `Bearer ${secreto}` },
    }));
    expect([200, 503]).toContain(respuesta.status);
    if (respuesta.status === 200) {
      const cuerpo = (await jsonDe(respuesta)) as { refrescadas?: number };
      expect(cuerpo.refrescadas).toBe(0);
    }

    const malo = await postRevalidar(peticion('/api/revalidar?maximo=50000', {
      method: 'POST',
      headers: { authorization: `Bearer ${secreto}` },
    }));
    expect(malo.status).toBe(400);
    expect(((await jsonDe(malo)) as Envoltorio).error?.codigo).toBe('parametro_invalido');
  });

  it('una respuesta pública no lleva datos de cuenta ni campos de sesión', async () => {
    const respuesta = await llama(getCompeticion, '/api/v1/competiciones/3769', { id: '3769' });
    const texto = await respuesta.text();
    for (const prohibido of ['usuario', 'favorito', 'sesion', 'password', 'token', 'aviso']) {
      expect(texto.toLowerCase(), `la API pública no debe contener «${prohibido}»`).not.toContain(`"${prohibido}`);
    }
  });
});
