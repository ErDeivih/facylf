/**
 * Cliente HTTP hacia rfcylf.es.
 *
 * El bloqueo que apareció al principio del proyecto venía de una herramienta que
 * respeta `robots.txt`, **no de una defensa anti-bots de la federación**. No hay nada
 * que evadir, y la única forma de perder el acceso es comportarse mal.
 *
 * Estas reglas no se relajan sin hablarlo (CLAUDE.md):
 *   · User-Agent identificable, con URL de explicación y correo real
 *   · 30 peticiones/minuto como techo, una sola concurrente
 *   · If-None-Match con el ETag guardado
 *   · backoff 30 s / 2 min / 8 min ante 429 y 5xx; al tercer fallo, se para
 *   · nunca de madrugada
 */

export interface OpcionesCliente {
  /** URL pública que explica qué hace el bot. Sin ella el cliente no arranca. */
  urlBot: string;
  /** Correo al que se puede escribir para pedir que pare. Idem. */
  contacto: string;
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

  constructor(private readonly op: OpcionesCliente) {
    if (!op.urlBot || !op.contacto) {
      throw new Error(
        'El cliente necesita una URL y un correo reales para identificarse. ' +
        'Rellena BOT_URL y BOT_CONTACTO en .env — no pongas un valor de ejemplo.',
      );
    }
    this.ua = `FutbolSalamancaBot/${op.version ?? '1.0'} (+${op.urlBot}; ${op.contacto})`;
    this.porMinuto = op.porMinuto ?? 30;
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
      try {
        r = await this.hacerFetch(url, {
          headers: {
            'User-Agent': this.ua,
            'Accept-Language': 'es-ES,es;q=0.9',
            ...(etagPrevio ? { 'If-None-Match': etagPrevio } : {}),
          },
          redirect: 'follow',
        });
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

      return {
        estado: r.status, sinCambios: false,
        cuerpo: new Uint8Array(await r.arrayBuffer()),
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
