/**
 * Escudos: firma de la imagen, descubrimiento del logo, contrato de las consultas y render.
 *
 * Lo que se defiende aquí, en el orden en que importa:
 *
 * 1. **No se sirve lo que no es una imagen.** El MIME sale de los bytes, no de lo que diga la web: un
 *    portal que responde `image/png` con un HTML no entra en la base ni se le sirve al navegador.
 * 2. **No se descargan cosas enormes.** El tope de 512 KB es una regla del encargo, no una sugerencia.
 * 3. **La URL se resuelve contra el portal y se valida**: nada de `data:`, `javascript:` ni rutas
 *    relativas sueltas. Y un favicon `.ico` no se propone: no es un formato admitido.
 * 4. **Las consultas traen el escudo sin N+1**: `club_id` + `tiene_escudo` en la clasificación, los dos
 *    equipos con sus ids/códigos y su escudo en los partidos, y el escudo de la federación en la
 *    portada del grupo. Todo con `EXISTS` contra el registro vigente.
 * 5. **El render**: con escudo real se pinta `<img>` decorativa del tamaño fijo; sin él, el marcador
 *    determinista de siempre (nunca un hueco ni un icono inventado).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BOT_UA, MIME_ADMITIDOS, TAMANO_MAXIMO, detectaMimeImagen, esDelMismoSitio, esDelSitioDelPortal,
  esFederacionObjetivo, extraeCandidatosLogo, extraeLogoDeCabecera, resuelveUrlImagen,
} from '../../../scripts/lib/escudos-federacion.mjs';
import { Escudo } from '../src/componentes/Escudo';
import { EscudoFederacion } from '../src/componentes/EscudoFederacion';
import { cierraCanonico, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';
import { CLASIFICACION_DE_LA_PANTALLA, GRUPO_POR_ID } from '../src/consultas/competiciones';
import { PARTIDOS_DE_GRUPO } from '../src/consultas/partidos';

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

afterAll(async () => {
  await cierraCanonico();
});

const bytes = (...valores: number[]) => Uint8Array.from(valores);

/** Cabecera real de un PNG (8 bytes) seguida de relleno cualquiera. */
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46);
const WEBP = Uint8Array.from([
  ...new TextEncoder().encode('RIFF'), 0x24, 0, 0, 0, ...new TextEncoder().encode('WEBP'),
]);
const SVG = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>');
const ICO = bytes(0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, 0, 0, 1, 0);
const HTML = new TextEncoder().encode('<!doctype html><html><body>hola</body></html>');

describe('la firma real de la imagen manda (no el Content-Type de la web)', () => {
  it('reconoce los cuatro formatos admitidos por su cabecera', () => {
    expect(detectaMimeImagen(PNG)).toBe('image/png');
    expect(detectaMimeImagen(JPEG)).toBe('image/jpeg');
    expect(detectaMimeImagen(WEBP)).toBe('image/webp');
    expect(detectaMimeImagen(SVG)).toBe('image/svg+xml');
  });

  it('un .ico, un HTML o basura no son imágenes admitidas', () => {
    expect(detectaMimeImagen(ICO)).toBeNull();
    expect(detectaMimeImagen(HTML)).toBeNull();
    expect(detectaMimeImagen(new TextEncoder().encode('<html><img src="x.png"></html>'))).toBeNull();
    expect(detectaMimeImagen(Uint8Array.from([]))).toBeNull();
    expect(detectaMimeImagen(null)).toBeNull();
  });

  it('un SVG con BOM o con XML de prólogo también se reconoce', () => {
    const conBom = new TextEncoder().encode('\ufeff<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE svg><svg></svg>');
    expect(detectaMimeImagen(conBom)).toBe('image/svg+xml');
  });

  it('el MIME detectado siempre está en la lista que admite la tabla', () => {
    for (const muestra of [PNG, JPEG, WEBP, SVG]) {
      expect(MIME_ADMITIDOS).toContain(detectaMimeImagen(muestra));
    }
  });
});

describe('la URL del logo se resuelve y se valida antes de pedirla', () => {
  const BASE = 'https://www.rfcylf.es/pnfg/';

  it('resuelve rutas relativas y protocolo-relativas contra el portal', () => {
    expect(resuelveUrlImagen('/img/logo.png', BASE)).toBe('https://www.rfcylf.es/img/logo.png');
    expect(resuelveUrlImagen('../imagenes/escudo.png', BASE)).toBe('https://www.rfcylf.es/imagenes/escudo.png');
    expect(resuelveUrlImagen('//cdn.ejemplo.es/escudo.png', BASE)).toBe('https://cdn.ejemplo.es/escudo.png');
  });

  it('deshace las entidades HTML del atributo y recorta espacios', () => {
    expect(resuelveUrlImagen('  /logo.png?a=1&amp;b=2  ', BASE)).toBe('https://www.rfcylf.es/logo.png?a=1&b=2');
  });

  it('rechaza esquemas que no son http(s) y valores sin URL', () => {
    expect(resuelveUrlImagen('data:image/png;base64,AAAA', BASE)).toBeNull();
    expect(resuelveUrlImagen('javascript:alert(1)', BASE)).toBeNull();
    expect(resuelveUrlImagen('mailto:info@rfcylf.es', BASE)).toBeNull();
    expect(resuelveUrlImagen('', BASE)).toBeNull();
    expect(resuelveUrlImagen('   ', BASE)).toBeNull();
    expect(resuelveUrlImagen(null, BASE)).toBeNull();
    expect(resuelveUrlImagen('sin-base.png', null)).toBeNull();
  });
});

describe('se localiza el logo del portal sin proponer favicons ni píxeles de seguimiento', () => {
  const BASE = 'https://www.rfcylf.es/pnfg/';

  it('prefiere la imagen con logo/escudo del HTML y descarta el favicon .ico', () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon.ico">
      <link rel="shortcut icon" type="image/png" href="/img/icono-192.png" sizes="192x192">
      </head><body>
      <img src="/imagenes/banner.jpg" alt="Banner de la jornada" width="800" height="200">
      <img src="/imagenes/logotipo-rfcylf.png" alt="Logotipo de la Federación" class="logo">
      <img src="/pixel.gif" width="1" height="1" alt="">
      </body></html>`;
    const candidatos = extraeCandidatosLogo(html, BASE);
    const urls = candidatos.map((c: { url: string }) => c.url);
    expect(urls[0]).toBe('https://www.rfcylf.es/imagenes/logotipo-rfcylf.png');
    expect(urls).toContain('https://www.rfcylf.es/img/icono-192.png');
    expect(urls.some((u: string) => u.endsWith('.ico'))).toBe(false);
    expect(urls.some((u: string) => u.endsWith('pixel.gif'))).toBe(false);
    expect(urls.some((u: string) => u.endsWith('banner.jpg'))).toBe(false);
  });

  it('un <img> con «escudo» en la clase también vale, y no se repite la misma URL', () => {
    const html = `<img class="escudo-federacion" src="/x/escudo.png">
      <img class="escudo-federacion" src="/x/escudo.png">`;
    const candidatos = extraeCandidatosLogo(html, BASE);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].url).toBe('https://www.rfcylf.es/x/escudo.png');
  });

  it('un portal sin logo en el HTML devuelve una lista vacía, no una URL inventada', () => {
    expect(extraeCandidatosLogo('<html><body><p>Sin logo</p></body></html>', BASE)).toEqual([]);
    expect(extraeCandidatosLogo('', BASE)).toEqual([]);
  });

  it('las federaciones de pruebas y las que no tienen portal no se piden', () => {
    expect(esFederacionObjetivo({ codigo: 'castilla-leon', portal_url: 'https://www.rfcylf.es/pnfg/' })).toBe(true);
    expect(esFederacionObjetivo({ codigo: 'pruebas', portal_url: 'https://ejemplo.test/' })).toBe(false);
    expect(esFederacionObjetivo({ codigo: 'pruebas-sincodigo', portal_url: 'https://ejemplo.test/' })).toBe(false);
    expect(esFederacionObjetivo({ codigo: 'castilla-leon', portal_url: null })).toBe(false);
  });

  it('el recolector se identifica con FacylfBot/1.0 y no admite más de 512 KB', () => {
    expect(BOT_UA).toBe('FacylfBot/1.0');
    expect(TAMANO_MAXIMO).toBe(512 * 1024);
  });
});

describe('el logo de la cabecera del HTML archivado (portal que exige cookie)', () => {
  const BASE = 'https://www.rfcylf.es/pnfg/';

  it('encuentra el logo de la cabecera del portal y no los escudos de los equipos', () => {
    // Cabecera real de una página PNFG archivada por el recolector.
    const html = `<div class="cabecera">
      <img src="https://files.rfcylf.es/pnfg/img/web_responsive_2/ESP/logo(fcylf).png" class="logocabecera">
      <img src="https://files.rfcylf.es/pnfg/img/web_responsive_2/ESP/esp.png" style="width:30px;">
      <img src="https://rfcylf.filesnovanet.es/pnfg/pimg/Clubes/00100_0074506938_abc.png" align="absmiddle" class="escudo_widget2">
      </div>`;
    const candidatos = extraeLogoDeCabecera(html, BASE);
    expect(candidatos.length).toBeGreaterThan(0);
    expect(candidatos[0].url).toBe('https://files.rfcylf.es/pnfg/img/web_responsive_2/ESP/logo(fcylf).png');
    expect(candidatos.every((c: { url: string }) => !c.url.includes('/pimg/Clubes/'))).toBe(true);
  });

  it('sin logo de cabecera devuelve una lista vacía', () => {
    expect(extraeLogoDeCabecera('<div><img src="/banner.png" alt="Banner"></div>', BASE)).toEqual([]);
  });

  it('el logo tiene que ser del mismo sitio que el portal o de una página que nombre ese dominio)', () => {
    expect(esDelMismoSitio('https://files.rfcylf.es/pnfg/img/ESP/logo(fcylf).png', 'https://www.rfcylf.es/pnfg/')).toBe(true);
    // Caso real del primer intento: el HTML de otra federación traía el logo de CyL. No puede guardarse.
    expect(esDelMismoSitio('https://files.rfcylf.es/pnfg/img/ESP/logo(fcylf).png', 'https://www.rfaf.es/pnfg/')).toBe(false);
    expect(esDelMismoSitio('', 'https://www.rfaf.es/pnfg/')).toBe(false);
    expect(esDelMismoSitio('https://x.es/a.png', null)).toBe(false);
  });

  it('un logo en el CDN compartido vale si el HTML archivado nombra el dominio del portal', () => {
    const portal = 'https://www.federacioncanariafutbol.es/pnfg/';
    const logo = 'https://filescanarias.filesnovanet.es/pnfg/img/ESP/logo(ffcanarias).png';
    const htmlPropio = '<html><head><link rel="canonical" href="https://www.federacioncanariafutbol.es/pnfg/"></head></html>';
    expect(esDelSitioDelPortal(logo, portal, htmlPropio)).toBe(true);
    // El mismo logo en un HTML de otra federación no se acepta.
    expect(esDelSitioDelPortal(logo, portal, '<html><a href="https://www.rfaf.es">RFEF</a></html>')).toBe(false);
    // Y si es del mismo sitio, no hace falta que el HTML lo diga.
    expect(esDelSitioDelPortal('https://files.rfaf.es/x.png', 'https://www.rfaf.es/pnfg/', '')).toBe(true);
  });
});

describe('contrato de las consultas con escudos (sin N+1)', () => {
  it('la clasificación de la pantalla pide club_id y tiene_escudo con un EXISTS del vigente', () => {
    expect(CLASIFICACION_DE_LA_PANTALLA.columnas).toContain('club_id');
    expect(CLASIFICACION_DE_LA_PANTALLA.columnas).toContain('tiene_escudo');
    expect(CLASIFICACION_DE_LA_PANTALLA.sql).toContain('core.club_asset');
    expect(CLASIFICACION_DE_LA_PANTALLA.sql).toMatch(/tipo\s*=\s*'escudo'/);
    expect(CLASIFICACION_DE_LA_PANTALLA.sql).toMatch(/vigente/);
  });

  it('los partidos llevan ids y códigos de los dos equipos y el escudo de cada uno', () => {
    for (const columna of ['local_id', 'visitante_id', 'local_codigo', 'visitante_codigo',
      'local_club_id', 'visitante_club_id', 'local_tiene_escudo', 'visitante_tiene_escudo']) {
      expect(PARTIDOS_DE_GRUPO.columnas, `falta ${columna}`).toContain(columna);
    }
    expect(PARTIDOS_DE_GRUPO.sql).toContain('core.club_asset');
  });

  it('la portada del grupo dice si la federación tiene escudo', () => {
    expect(GRUPO_POR_ID.columnas).toContain('federacion_tiene_escudo');
    expect(GRUPO_POR_ID.sql).toContain('core.federation_asset');
    // El código de la federación ya lo trae la consulta: es lo que usa la ruta de la imagen.
    expect(GRUPO_POR_ID.columnas).toContain('federacion');
  });

  it('ninguna de las tres consultas cambia sus parámetros por añadir los escudos', () => {
    expect(GRUPO_POR_ID.sql).toContain('$1');
    expect(CLASIFICACION_DE_LA_PANTALLA.sql).toContain('$1');
    expect(PARTIDOS_DE_GRUPO.sql).toContain('$3');
  });

  it('los partidos traen además la fecha publicada del calendario, sin rellenar la del partido', () => {
    expect(PARTIDOS_DE_GRUPO.columnas).toContain('fecha_prevista');
    expect(PARTIDOS_DE_GRUPO.sql).toContain('fecha_prevista');
    // Dos columnas, no una: `fecha` sigue siendo la del partido jugado.
    expect(PARTIDOS_DE_GRUPO.columnas).toContain('fecha');
  });
});

describe.skipIf(!hayCanonico)('los escudos que prometen las consultas salen del canónico', () => {
  it('cada fila de la clasificación trae club_id y un tiene_escudo que coincide con la base', async () => {
    const filas = await consulta<{ equipo_id: number; club_id: number; tiene_escudo: boolean }>(
      CLASIFICACION_DE_LA_PANTALLA.sql, [3769]);
    expect(filas.length).toBeGreaterThan(0);
    const clubes = filas.map((f) => Number(f.club_id));
    const conEscudo = await consulta<{ club_id: number }>(
      `select club_id from core.club_asset where tipo='escudo' and vigente and club_id = any($1::bigint[])`, [clubes]);
    const vigentes = new Set(conEscudo.map((f) => Number(f.club_id)));
    for (const fila of filas) {
      expect(Number.isInteger(Number(fila.club_id)), `club de ${fila.equipo_id}`).toBe(true);
      expect(Number(fila.club_id)).toBeGreaterThan(0);
      expect(fila.tiene_escudo, `equipo ${fila.equipo_id}`).toBe(vigentes.has(Number(fila.club_id)));
    }
  });

  it('cada partido trae los códigos de los dos equipos y el escudo de cada uno', async () => {
    const filas = await consulta<Record<string, unknown>>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24218935', 400]);
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(String(fila.local_codigo ?? '').length).toBeGreaterThan(0);
      expect(String(fila.visitante_codigo ?? '').length).toBeGreaterThan(0);
      expect(Number(fila.local_club_id)).toBeGreaterThan(0);
      expect(Number(fila.visitante_club_id)).toBeGreaterThan(0);
      expect(typeof fila.local_tiene_escudo).toBe('boolean');
      expect(typeof fila.visitante_tiene_escudo).toBe('boolean');
    }
  });

  it('la portada del grupo dice con un booleano si la federación tiene escudo', async () => {
    for (const grupo of [797, 3769]) {
      const [fila] = await consulta<{ federacion: string; federacion_tiene_escudo: boolean }>(GRUPO_POR_ID.sql, [grupo]);
      expect(fila, `grupo ${grupo}`).toBeDefined();
      expect(typeof fila!.federacion_tiene_escudo).toBe('boolean');
      const [real] = await consulta<{ hay: boolean }>(
        `select exists (select 1 from core.federation_asset fa join core.federation f on f.id = fa.federation_id
                         where f.codigo = $1 and fa.tipo='escudo' and fa.vigente) as hay`, [fila!.federacion]);
      expect(fila!.federacion_tiene_escudo).toBe(real!.hay);
    }
  });

  it('un grupo con calendario y sin resultados trae la fecha publicada, no una inventada', async () => {
    // Grupo 50293 (CyL 2022-23): calendario publicado y ningún partido jugado. Es el caso que la
    // pantalla de Jornada necesita: `fecha` es null y `fecha_prevista` sí existe y es la publicada.
    const filas = await consulta<{ fecha: string | null; fecha_prevista: string | null }>(
      PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '50293', 400]);
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(fila.fecha).toBeNull();
      expect(String(fila.fecha_prevista ?? '')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('el escudo del club renderizado', () => {
  it('con escudo real pinta la imagen de la API, decorativa y a 22×24', () => {
    const html = renderToStaticMarkup(createElement(Escudo, {
      equipoId: 17607, nombre: 'Burgos C.F. S.A.D.', clubId: 42, tieneEscudo: true,
    }));
    expect(html).toContain('<img');
    expect(html).toContain('src="/api/escudo/club/42"');
    expect(html).toContain('width="22"');
    expect(html).toContain('height="24"');
    // Decorativo: el nombre va al lado como texto; el lector de pantalla no necesita oír «escudo».
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('<svg');
  });

  it('sin escudo real sigue el marcador determinista con las iniciales', () => {
    for (const props of [
      { equipoId: 17607, nombre: 'Burgos C.F. S.A.D.' },
      { equipoId: 17607, nombre: 'Burgos C.F. S.A.D.', clubId: null, tieneEscudo: null },
      { equipoId: 17607, nombre: 'Burgos C.F. S.A.D.', clubId: 42, tieneEscudo: false },
    ]) {
      const html = renderToStaticMarkup(createElement(Escudo, props));
      expect(html).toContain('<svg');
      expect(html).not.toContain('<img');
      expect(html).toContain('width="22"');
      expect(html).toContain('height="24"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('BC');
    }
  });
});

describe('el escudo de la federación renderizado', () => {
  it('con escudo real pinta la imagen de la API a 56×56', () => {
    const html = renderToStaticMarkup(createElement(EscudoFederacion, {
      codigo: 'castilla-leon', nombre: 'Real Federación de Castilla y León de Fútbol', tieneEscudo: true,
    }));
    expect(html).toContain('<img');
    expect(html).toContain('src="/api/escudo/federacion/castilla-leon"');
    expect(html).toContain('width="56"');
    expect(html).toContain('height="56"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('<svg');
  });

  it('sin escudo cae a las siglas del nombre con el tamaño de la cabecera', () => {
    const html = renderToStaticMarkup(createElement(EscudoFederacion, {
      codigo: 'castilla-leon', nombre: 'Real Federación de Castilla y León de Fútbol', tieneEscudo: false,
    }));
    expect(html).not.toContain('<img');
    expect(html).toContain('<svg');
    expect(html).toContain('width="56"');
    expect(html).toContain('height="56"');
    expect(html).toContain('RF');
    expect(html).toContain('aria-hidden="true"');
  });

  it('un código con caracteres raros no rompe la URL: se codifica', () => {
    const html = renderToStaticMarkup(createElement(EscudoFederacion, {
      codigo: 'castilla leon/x', nombre: 'Federación', tieneEscudo: true,
    }));
    expect(html).toContain('src="/api/escudo/federacion/castilla%20leon%2Fx"');
  });
});
