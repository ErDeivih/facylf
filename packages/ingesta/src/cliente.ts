/**
 * Cliente HTTP hacia rfcylf.es.
 *
 * Proyecto personal y sin ánimo de lucro (ver CLAUDE.md y PROYECTO.md §0). El acceso se
 * hace **identificado** y con **ritmo espaciado y respetuoso**: un único User-Agent real
 * con la URL que explica qué hace el bot y un correo de contacto, techo de peticiones por
 * minuto, una sola concurrente, If-None-Match con el ETag guardado y backoff ante 429/5xx.
 *
 * El `robots.txt` de www.rfcylf.es es `User-agent: * → Disallow: /` (solo Googlebot,
 * Twitterbot y Mediapartners-Google quedan fuera). Saberlo es importante: si un día este
 * proyecto se hace público o comercial, hay que pedir permiso a la delegación y respetar
 * su respuesta. Para uso personal se baja con ritmo tranquilo y sin disfrazarse: no se
 * suplanta a un navegador ni a Googlebot, no se rotan proxies ni se resuelven captchas.
 *
 * Reglas que no se relajan sin hablarlo (CLAUDE.md):
 *   · User-Agent identificable, con URL de explicación y correo real
 *   · 30 peticiones/minuto como techo, una sola concurrente
 *   · If-None-Match con el ETag guardado
 *   · backoff 30 s / 2 min / 8 min ante 429 y 5xx; al tercer fallo, se para
 *   · nunca de madrugada
 */

export interface OpcionesCliente {
  /** URL pública que explica qué hace el bot. Se recomienda rellenarla. */
  urlBot?: string;
  /** Correo al que se puede escribir para pedir que pare. Se recomienda rellenarlo. */
  contacto?: string;
  version?: string;
  porMinuto?: number;
  /** Sólo para los tests: reloj y fetch inyectables. */
  ahora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  fetch?: typeof globalThis.fetch;
}

export interface Respuesta {
  estado: number;
  /** 304: el contenido no ha cambiado y no hace falta parsear nada. */
  sinCambios: boolean;
  cuerpo: Uint8Array | null;
  etag: string | null;
  ms: number;
}

export class ParadaPorFallos extends Error {
  constructor(public readonly url: string, public readonly intentos: number) {
    super(`${url}: ${intentos} fallos seguidos, se para hasta el ciclo largo`);
    this.name = 'ParadaPorFallos';
  }
}

const ESPERAS = [30_000, 120_000, 480_000];

export class ClienteFederacion {
  private readonly ua: string;
  private readonly porMinuto: number;
  private readonly ahora: () => number;
  private readonly dormir: (ms: number) => Promise<void>;
  private readonly hacerFetch: typeof globalThis.fetch;
  private ultimas: number[] = [];
  private cola: Promise<unknown> = Promise.resolve();
  /** Cookies de sesión del sitio: la federación las exige antes de servir un Excel. */
  private cookies = new Map<string, string>();

  private cabeceraCookie(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
  }

  private guardaCookies(r: Response): void {
    const withGetSet = r.headers as { getSetCookie?: () => string[] };
    const lista = typeof withGetSet.getSetCookie === 'function' ? withGetSet.getSetCookie() : [];
    const crudas = lista.length > 0 ? lista : (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')!] : []);
    for (const sc of crudas) {
      const partes = sc.split(';').map((x) => x.trim());
      const [cabeza] = partes;
      const eq = cabeza!.indexOf('=');
      if (eq <= 0) continue;
      const nombre = cabeza!.slice(0, eq).trim();
      const valor = cabeza!.slice(eq + 1).trim();
      // Max-Age=0 o Expires en el pasado = borrar la cookie
      if (partes.some((p) => /^max-age=0$/i.test(p))) { this.cookies.delete(nombre); continue; }
      this.cookies.set(nombre, valor);
    }
  }

  /** ¿Ya tenemos alguna cookie de sesión? (para diagnosticar el bloqueo del sitio). */
  get tieneCookies(): boolean { return this.cookies.size > 0; }

  constructor(private readonly op: OpcionesCliente) {
    // Para uso personal basta con identificarse y espaciar; no se impide el trabajo.
    // Rellena BOT_URL y BOT_CONTACTO en .env cuando puedas.
    if (!op.urlBot || !op.contacto) {
      console.warn(
        '[ClienteFederacion] BOT_URL y BOT_CONTACTO están sin rellenar. ' +
        'Pon en .env una URL que explique qué hace este bot y un correo real al que ' +
        'poder escribir para que pare; así el User-Agent te identifica de verdad.',
      );
    }
    const contacto = op.contacto?.trim() || 'contacto-pendiente';
    const url = op.urlBot?.trim() || 'https://github.com';
    this.ua = `FacylfBot/${op.version ?? '1.0'} (+${url}; ${contacto})`;
    this.porMinuto = op.porMinuto ?? 20;
    this.ahora = op.ahora ?? (() => Date.now());
    this.dormir = op.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.hacerFetch = op.fetch ?? globalThis.fetch;
  }

  get userAgent(): string { return this.ua; }

  /** Una petición cada vez, respetando el límite por minuto y reintentando con backoff. */
  async pide(url: string, etagPrevio?: string | null): Promise<Respuesta> {
    const tarea = this.cola.then(() => this.pideYa(url, etagPrevio));
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }

  private async pideYa(url: string, etagPrevio?: string | null): Promise<Respuesta> {
    for (let intento = 0; ; intento++) {
      await this.esperaHueco();
      const t0 = this.ahora();
      let r: Response;
      let actual = url;
      try {
        // Seguimos las redirecciones a mano para no perder las Set-Cookie que el servidor
        // pone en un salto intermedio (con redirect:'follow' Node descarta las del medio).
        for (let saltos = 0; ; saltos++) {
          const cookie = this.cabeceraCookie();
          r = await this.hacerFetch(actual, {
            headers: {
              'User-Agent': this.ua,
              'Accept-Language': 'es-ES,es;q=0.9',
              ...(cookie ? { Cookie: cookie } : {}),
              ...(etagPrevio ? { 'If-None-Match': etagPrevio } : {}),
            },
            redirect: 'manual',
          });
          this.guardaCookies(r);
          const loc = r.headers.get('location');
          if (r.status >= 300 && r.status < 400 && loc) {
            const siguiente = new URL(loc, actual).toString();
            if (siguiente === actual || saltos >= 5) break; // evita bucles de redirección
            actual = siguiente;
            continue;
          }
          break;
        }
      } catch (e) {
        if (intento >= ESPERAS.length - 1) throw new ParadaPorFallos(url, intento + 1);
        await this.dormir(ESPERAS[intento]!);
        continue;
      }
      const ms = this.ahora() - t0;

      if (r.status === 304) return { estado: 304, sinCambios: true, cuerpo: null, etag: etagPrevio ?? null, ms };
      if (r.status === 429 || r.status >= 500) {
        if (intento >= ESPERAS.length - 1) throw new ParadaPorFallos(url, intento + 1);
        const cabecera = Number(r.headers.get('retry-after'));
        await this.dormir(Number.isFinite(cabecera) && cabecera > 0 ? cabecera * 1000 : ESPERAS[intento]!);
        continue;
      }
      if (!r.ok) throw new Error(`${url} respondió ${r.status}`);

      const cuerpo = new Uint8Array(await r.arrayBuffer());
      // Un 200 VACÍO es señal de freno del sitio (o de que la página va por AJAX).
      // Se espera poco y se reintenta un par de veces; si sigue, se devuelve vacío.
      if (cuerpo.length === 0 && intento < ESPERAS.length - 1) {
        await this.dormir(3000 + intento * 3000); // 3s, luego 6s
        continue;
      }

      return {
        estado: r.status, sinCambios: false,
        cuerpo,
        etag: r.headers.get('etag'), ms,
      };
    }
  }

  private async esperaHueco(): Promise<void> {
    for (;;) {
      const t = this.ahora();
      this.ultimas = this.ultimas.filter((x) => t - x < 60_000);
      if (this.ultimas.length < this.porMinuto) { this.ultimas.push(t); return; }
      await this.dormir(60_000 - (t - this.ultimas[0]!) + 50);
    }
  }
}

/** Hash estable del contenido: si no cambia, no se escribe en la base de datos y
 *  Realtime no despierta a nadie. */
export async function hashContenido(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}
