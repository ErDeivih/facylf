import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { CABECERA_RUTA, TEMA_COOKIE, esRutaConTema, temaDeCookie } from '@/lib/tema';
import { CabeceraSitioActiva } from '@/componentes/cabecera/CabeceraSitioActiva';
import { SESION_COOKIE } from '@/lib/sesion';
import { PieSitio } from '@/componentes/marca/PieSitio';
import { Metricas } from '@/componentes/Metricas';
import { TITULO_POR_DEFECTO } from '@/componentes/marca/marca';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: TITULO_POR_DEFECTO,
  description: 'Resultados, clasificaciones y pronósticos del fútbol de Castilla y León, de Tercera Federación al fútbol base.',
  robots: { index: false, follow: false },
};

/**
 * Layout raíz.
 *
 * El tema se decide **aquí, en el servidor**: se lee la cookie `tema` y se escribe `data-tema` en
 * `<html>`, que es lo que `tokens.css` mira para cambiar los roles de color. El primer HTML ya sale
 * con el tema correcto: no hay `useEffect` que lo aplique después ni, por tanto, parpadeo. Sin
 * cookie o con un valor que no vale, claro.
 *
 * El secreto de qué ruta es la actual no lo tiene el layout: lo deja `src/proxy.ts` en la cabecera
 * `x-pathname`. Hace falta porque el tema oscuro sólo se permite en las rutas migradas
 * (`/explorar…`); en las viejas, con colores literales, se fuerza claro para que no queden
 * ilegibles. Esa ruta también decide si la cabecera pinta el control de tema.
 *
 * `cookies()` es asíncrono en Next 16 y hace que las rutas se sirvan por petición (el tema puede
 * cambiar de una a otra): es el precio de que el HTML inicial no parpadee.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const [almacen, cabeceras] = await Promise.all([cookies(), headers()]);
  const ruta = cabeceras.get(CABECERA_RUTA) ?? '/';
  const permiteTema = esRutaConTema(ruta);
  const tema = permiteTema ? temaDeCookie(almacen.get(TEMA_COOKIE)?.value) : 'claro';

  return (
    <html lang="es" data-tema={tema}>
      <body className="antialiased">
        {/* Sólo se mira si la cookie existe (sin consulta): si la sesión ha caducado, el panel manda a entrar. */}
        <CabeceraSitioActiva tema={tema} permiteTema={permiteTema} conSesion={Boolean(almacen.get(SESION_COOKIE)?.value)} />
        <main className="mx-auto max-w-[1240px] px-5 py-8">{children}</main>
        <PieSitio />
        <Metricas />
      </body>
    </html>
  );
}
