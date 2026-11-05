/**
 * Arranque del servidor de la web: consume la cola de invalidaciones de caché cada minuto.
 *
 * Es la mitad del diseño de `RENDIMIENTO-BASE.md` §4: el proyector apunta en `ops.invalidacion` las
 * etiquetas de lo que ha cambiado y llama a `POST /api/revalidar`; si la web estaba parada (o la llamada
 * se perdió), este temporizador recoge lo pendiente al arrancar y cada minuto. Así una ficha visitada
 * mil veces no vuelve a PostgreSQL hasta que su dato cambia de verdad.
 *
 * Sólo corre en el runtime de Node (no en el borde) y no hace nada durante el build: la base no tiene
 * por qué estar levantada para compilar la web.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { consumeInvalidaciones } = await import('@/lib/cache');
  const tic = () => {
    void consumeInvalidaciones().catch(() => {
      // Sin canónico o sin secreto no se cae el servidor: se reintenta en el siguiente minuto.
    });
  };
  tic();
  const intervalo = setInterval(tic, 60_000);
  // No mantener el proceso vivo por este temporizador (scripts, tests y cierres ordenados).
  intervalo.unref?.();
}
