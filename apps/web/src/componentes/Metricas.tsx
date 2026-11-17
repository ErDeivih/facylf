'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Envía una vista por página, una sola vez, sin cookies ni identificadores. */
export function Metricas() {
  const ruta = usePathname();
  useEffect(() => {
    if (!ruta || ruta.startsWith('/mi-') || ruta.startsWith('/admin') || ruta.startsWith('/entrar') || ruta.startsWith('/crear-cuenta')) return;
    const cuerpo = JSON.stringify({ ruta, referrer: document.referrer || null });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/metricas', new Blob([cuerpo], { type: 'application/json' }));
    else void fetch('/api/metricas', { method: 'POST', body: cuerpo, headers: { 'content-type': 'application/json' }, keepalive: true });
  }, [ruta]);
  return null;
}
