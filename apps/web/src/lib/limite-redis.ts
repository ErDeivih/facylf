import Redis from 'ioredis';

/**
 * Límite compartido con Redis. Si no hay `REDIS_URL` o Redis no responde, devuelve `null` y el
 * llamador conserva el límite en memoria. Nunca lanza: un fallo de Redis no tumba la web.
 */
let cliente: Redis | null = null;

function conexion(url: string): Redis {
  if (cliente) return cliente;
  cliente = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 350,
    commandTimeout: 350,
  });
  cliente.on('error', () => { /* silencio: el fallback es memoria */ });
  return cliente;
}

export async function limiteRedis(clave: string, maximo: number, segundos: number): Promise<boolean | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const r = conexion(url);
    if (r.status === 'wait' || r.status === 'end') await r.connect();
    const usos = await r.incr(clave);
    if (usos === 1) await r.expire(clave, segundos);
    return usos <= maximo;
  } catch {
    return null;
  }
}
