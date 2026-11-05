import { NextResponse } from 'next/server';

/**
 * Respuesta HTTP de un escudo guardado en el canónico (`bytea` + su MIME).
 *
 * Vive aparte para que las dos rutas (`/api/escudo/club/[id]` y `/api/escudo/federacion/[codigo]`)
 * manden EXACTAMENTE las mismas cabeceras: una imagen servida con otra caché o sin `nosniff` en una
 * de las dos sería la clase de diferencia que nadie ve hasta que importa.
 *
 * ── POR QUÉ `Content-Security-Policy` Y `nosniff` ────────────────────────────────────────────────────
 *
 * La firma del fichero ya se validó al guardarlo (0056 admite SVG), pero esta ruta también puede
 * abrirse directamente en el navegador. Un SVG navegado como documento puede llevar scripts; con
 * `default-src 'none'; sandbox` no se ejecuta nada, y con `nosniff` el navegador no reinterpreta el
 * contenido como otro tipo. Para un PNG o un JPEG esas cabeceras no hacen nada.
 *
 * ── CACHÉ ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * El escudo cambia muy poco y pesa unos pocos KB: un día de caché de navegador evita que una tabla de
 * 16 equipos pida 16 imágenes en cada visita. No se marca `immutable`: la ruta sirve el registro
 * VIGENTE, así que si el club o la federación cambian el escudo, la URL sigue siendo la misma y el
 * fichero puede cambiar; `stale-while-revalidate` deja refrescarlo sin bloquear la tabla.
 */
export const CABECERAS_ESCUDO = {
  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
} as const;

/** Un escudo encontrado: el binario tal cual con su `Content-Type`. */
export function respuestaDeEscudo(fila: { mime_type: string; contenido: Buffer | Uint8Array }): NextResponse {
  return new NextResponse(new Uint8Array(fila.contenido), {
    status: 200,
    headers: {
      'Content-Type': fila.mime_type,
      'Content-Length': String(fila.contenido.length),
      ...CABECERAS_ESCUDO,
    },
  });
}

/**
 * 404 limpio: no hay escudo guardado (o el identificador no es válido).
 *
 * Sin cuerpo y sin caché: un «no hay» de hoy no puede quedarse pegado en el navegador cuando el
 * escudo se guarde mañana. La imagen del `<img>` se queda rota, que es la verdad, y el componente pinta
 * su marcador de posición cuando la consulta ya dijo que no había escudo: este 404 es la red de
 * seguridad, no el camino normal.
 */
export function escudoNoEncontrado(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
