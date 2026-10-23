/**
 * HUECOS DE ANUNCIO (migraciones 0033 + 0042). En la fase C se reparte así:
 *   · `EspacioAnuncio`  → apps/web/src/components/anuncios/EspacioAnuncio.tsx   (componente de servidor)
 *   · `HuecoAnuncio`    → apps/web/src/components/anuncios/HuecoAnuncio.tsx     ('use client')
 *   · `POST_evento`     → apps/web/src/app/api/anuncio/route.ts                 (export { POST_evento as POST })
 *   · `GET_clic`        → apps/web/src/app/api/anuncio/clic/route.ts            (export { GET_clic as GET })
 *
 * Reglas (PUBLICIDAD.md §3-4, probadas en m42):
 *  1. Nunca en acceso/registro, cuenta, administración ni páginas con menores: la página pasa
 *     `conMenores` y `app.elige_campana` devuelve nada. Paquetes sin anuncios, igual.
 *  2. SIN SALTOS DE PÁGINA (CLS = 0): qué hueco sale se decide en el servidor, antes de mandar el HTML; si
 *     no sale nada no se pinta nada, y si sale, el contenedor llega con su alto reservado por formato.
 *     Un AdSense que se queda sin anuncio conserva el hueco (con un aviso propio), no se encoge.
 *  3. CARGA DIFERIDA: el script de AdSense se pide cuando el primer hueco está a 300 px de la pantalla (y
 *     sólo tras el consentimiento del CMP); las imágenes de patrocinio con `loading="lazy"`.
 *  4. MEDICIÓN sin cookies: 'impresion' cuando el hueco llega a un navegador (no al pintar en el servidor:
 *     así no cuentan ni las páginas cacheadas ni los prefetch), 'vista' cuando el 50 % está en pantalla 1 s
 *     seguido (norma IAB), 'clic' en el redirector, que lee el destino de la base (nunca de la URL: no es un
 *     redirector abierto).
 *  5. El hueco no se cachea entre usuarios (depende del paquete): va dentro de <Suspense> y la página
 *     pública sigue cacheada por etiquetas (cache.ts).
 */
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { Pool } from 'pg';
import { auth } from '@/lib/auth';
import { HuecoAnuncio } from './HuecoAnuncio';

const db = new Pool({ connectionString: process.env.DATABASE_URL_APP, max: 5, statement_timeout: 2000 });

/** Alto reservado por formato (escritorio / móvil). Coincide con los formatos de app.espacio_anuncio. */
export const ALTO: Record<string, { escritorio: number; movil: number; ancho: number }> = {
  rectangulo_300x250:   { escritorio: 250, movil: 250, ancho: 300 },
  media_pagina_300x600: { escritorio: 600, movil: 0,   ancho: 300 },   // sólo escritorio (columna lateral)
  banner_728x90:        { escritorio: 90,  movil: 100, ancho: 728 },   // en móvil se sirve 320x100
  banner_movil_320x100: { escritorio: 0,   movil: 100, ancho: 320 },
  nativo:               { escritorio: 120, movil: 140, ancho: 0 },     // ancho de la columna
  ancla_movil:          { escritorio: 0,   movil: 60,  ancho: 0 },     // fijo abajo: no desplaza nada
};

type Contexto = { federacion?: number | null; edicion?: number | null; club?: number | null; conMenores: boolean };
type Eleccion = { campana_id: number | null; titulo: string | null; imagen_url: string | null; destino_url: string | null;
                  proveedor: 'adsense' | 'directo'; adsense_slot: string | null };

async function elige(codigo: string, ctx: Contexto): Promise<Eleccion | null> {
  if (ctx.conMenores) return null;                                       // ni se pregunta
  const sesion = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const { rows } = await db.query<Eleccion>(
    `select campana_id::int, titulo, imagen_url, destino_url, proveedor, adsense_slot
       from app.elige_campana($1, $2::smallint, $3::bigint, $4::bigint, $5, $6)`,
    [codigo, ctx.federacion ?? null, ctx.edicion ?? null, ctx.club ?? null, sesion?.user.id ?? null, ctx.conMenores]);
  return rows[0] ?? null;
}

async function Espacio({ codigo, formato, ctx }: { codigo: string; formato: string; ctx: Contexto }) {
  const e = await elige(codigo, ctx).catch(() => null);                 // un fallo de anuncios nunca rompe la página
  if (!e) return null;
  return <HuecoAnuncio codigo={codigo} formato={formato} alto={ALTO[formato]} eleccion={e}
                       cliente={process.env.NEXT_PUBLIC_ADSENSE_CLIENTE ?? null} />;
}

/** Uso: <EspacioAnuncio codigo="competicion-entre-jornadas" formato="rectangulo_300x250" ctx={{ federacion, edicion, conMenores: false }} /> */
export function EspacioAnuncio(props: { codigo: string; formato: string; ctx: Contexto }) {
  // El respaldo de Suspense es vacío: el hueco aparece en el mismo sitio que tendrá (alto reservado dentro de
  // HuecoAnuncio) y, al estar el hueco entre secciones con su propio contenedor, no empuja contenido ya pintado.
  return <Suspense fallback={null}><Espacio {...props} /></Suspense>;
}

// ── Rutas ───────────────────────────────────────────────────────────────────────────────────────────

// Tope sencillo por IP para los eventos (en memoria del proceso; basta para una web privada).
const cubos = new Map<string, { n: number; desde: number }>();
function permite(ip: string, max = 120, ventanaMs = 60_000) {
  const ahora = Date.now(); const c = cubos.get(ip);
  if (!c || ahora - c.desde > ventanaMs) { cubos.set(ip, { n: 1, desde: ahora }); return true; }
  c.n += 1; return c.n <= max;
}
const ipDe = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

/** POST /api/anuncio  ← navigator.sendBeacon(JSON {e: espacio, c: campaña|null, t: 'impresion'|'vista'}) */
export async function POST_evento(req: NextRequest) {
  if (!permite(ipDe(req))) return new NextResponse(null, { status: 204 });   // se ignora en silencio
  const b = await req.json().catch(() => null) as { e?: string; c?: number | null; t?: string } | null;
  if (!b || typeof b.e !== 'string' || b.e.length > 60 || (b.t !== 'impresion' && b.t !== 'vista'))
    return new NextResponse(null, { status: 204 });
  await db.query(`select ops.cuenta_anuncio_evento($1, $2, $3)`, [b.e, b.c ?? null, b.t]).catch(() => null);
  return new NextResponse(null, { status: 204 });
}

/** GET /api/anuncio/clic?e=<espacio>&c=<campaña>  → cuenta y redirige al destino guardado en la campaña. */
export async function GET_clic(req: NextRequest) {
  const e = req.nextUrl.searchParams.get('e') ?? ''; const c = Number(req.nextUrl.searchParams.get('c'));
  if (!Number.isInteger(c) || c <= 0) return NextResponse.redirect(new URL('/', req.url));
  const { rows } = await db.query<{ destino_url: string }>(
    `select destino_url from app.campana_anuncio where id = $1 and $2 = any(espacios)`, [c, e]);
  if (!rows[0]) return NextResponse.redirect(new URL('/', req.url));
  if (permite(ipDe(req), 30)) await db.query(`select ops.cuenta_anuncio_evento($1, $2, 'clic')`, [e, c]).catch(() => null);
  return NextResponse.redirect(rows[0].destino_url, 302);
}

/* ── HuecoAnuncio.tsx ('use client') ──────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useRef, useState } from 'react';

declare global { interface Window { adsbygoogle?: unknown[]; __facylfAdsense?: Promise<void> } }

// El script de AdSense, una sola vez y sólo cuando hace falta (y el CMP ha dado consentimiento).
function cargaAdsense(cliente: string) {
  window.__facylfAdsense ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous'; s.onload = () => ok(); s.onerror = () => mal();
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cliente}`;
    document.head.appendChild(s);
  });
  return window.__facylfAdsense;
}
const beacon = (e: string, c: number | null, t: 'impresion' | 'vista') =>
  navigator.sendBeacon?.('/api/anuncio', new Blob([JSON.stringify({ e, c, t })], { type: 'application/json' }));

export function HuecoAnuncio({ codigo, formato, alto, eleccion, cliente }: {
  codigo: string; formato: string; alto: { escritorio: number; movil: number; ancho: number };
  eleccion: { campana_id: number | null; titulo: string | null; imagen_url: string | null; proveedor: 'adsense' | 'directo'; adsense_slot: string | null };
  cliente: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cerca, setCerca] = useState(false);
  const [cerrado, setCerrado] = useState(false);
  const c = eleccion.campana_id ?? null;

  useEffect(() => {
    const el = ref.current; if (!el) return;
    beacon(codigo, c, 'impresion');
    // Carga diferida: a 300 px de la pantalla.
    const lejos = new IntersectionObserver(([x]) => { if (x.isIntersecting) { setCerca(true); lejos.disconnect(); } },
                                           { rootMargin: '300px 0px' });
    lejos.observe(el);
    // Vista: 50 % visible durante 1 s seguido (si se va antes, se reinicia).
    let t: ReturnType<typeof setTimeout> | undefined; let contada = false;
    const vista = new IntersectionObserver(([x]) => {
      if (contada) return;
      if (x.intersectionRatio >= 0.5 && document.visibilityState === 'visible') {
        t ??= setTimeout(() => { contada = true; beacon(codigo, c, 'vista'); vista.disconnect(); }, 1000);
      } else { clearTimeout(t); t = undefined; }
    }, { threshold: [0, 0.5] });
    vista.observe(el);
    return () => { lejos.disconnect(); vista.disconnect(); clearTimeout(t); };
  }, [codigo, c]);

  useEffect(() => {
    if (!cerca || eleccion.proveedor !== 'adsense' || !cliente) return;
    if (!(window as { __tcfConsentimiento?: boolean }).__tcfConsentimiento) return;   // lo pone el CMP
    cargaAdsense(cliente).then(() => { (window.adsbygoogle ??= []).push({}); }).catch(() => {});
  }, [cerca, eleccion.proveedor, cliente]);

  if (cerrado) return null;   // sólo el ancla móvil se puede cerrar, y es fija: cerrarla no mueve nada
  const ancla = formato === 'ancla_movil';
  return (
    <aside ref={ref} aria-label="Publicidad" data-formato={formato}
      className={ancla ? 'anuncio anuncio--ancla' : 'anuncio'}
      style={{ ['--alto-escritorio' as string]: `${alto.escritorio}px`, ['--alto-movil' as string]: `${alto.movil}px`,
               maxWidth: alto.ancho || undefined }}>
      <span className="anuncio__etiqueta">Publicidad</span>
      {eleccion.proveedor === 'directo' && eleccion.imagen_url ? (
        <a href={`/api/anuncio/clic?e=${encodeURIComponent(codigo)}&c=${c}`} rel="sponsored noopener" target="_blank">
          <img src={eleccion.imagen_url} alt={eleccion.titulo ?? 'Patrocinador'} loading="lazy" decoding="async"
               width={alto.ancho || undefined} height={alto.escritorio || alto.movil || undefined} />
        </a>
      ) : cerca && cliente ? (
        <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client={cliente}
             data-ad-slot={eleccion.adsense_slot ?? undefined} data-ad-format={formato === 'nativo' ? 'fluid' : 'auto'}
             data-full-width-responsive="true" />
      ) : null}
      {ancla && <button type="button" className="anuncio__cerrar" onClick={() => setCerrado(true)} aria-label="Cerrar publicidad">×</button>}
    </aside>
  );
}

── CSS (apps/web/src/app/globals.css) ──

.anuncio { position: relative; margin: 24px auto; min-height: var(--alto-escritorio); contain: layout; }
@media (max-width: 767px) { .anuncio { min-height: var(--alto-movil); } .anuncio[data-formato="media_pagina_300x600"] { display: none; } }
@media (min-width: 768px) { .anuncio--ancla { display: none; } }
.anuncio__etiqueta { position: absolute; top: -16px; left: 0; font-size: 11px; color: var(--texto-tenue); }
.anuncio--ancla { position: fixed; inset: auto 0 0 0; margin: 0; z-index: 40; background: var(--superficie);
                  border-top: 1px solid var(--borde); padding-bottom: env(safe-area-inset-bottom); }
.anuncio__cerrar { position: absolute; top: 4px; right: 4px; min-width: 32px; min-height: 32px; }
// AdSense sin anuncio: se queda el hueco (no salta la página) con un aviso propio discreto.
.anuncio ins.adsbygoogle[data-ad-status="unfilled"] { display: none !important; }
.anuncio:has(ins[data-ad-status="unfilled"])::after { content: "Espacio publicitario"; display: grid; place-items: center;
  height: var(--alto-escritorio); color: var(--texto-tenue); font-size: 12px; }
// La página con ancla deja sitio abajo para que no tape el pie:
body:has(.anuncio--ancla) { padding-bottom: 60px; }

*/
