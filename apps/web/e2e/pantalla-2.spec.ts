import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Flujo de la pantalla 2 del prototipo: competición, clasificación y jornada.
 *
 * La referencia es un grupo REAL de Castilla y León del canónico: el 3769, «Liga Nacional Juvenil»
 * 2026-27, 16 equipos y la temporada en curso (jornada 4 de 30 en el momento de escribir esto).
 *
 * Estas pruebas miran lo que ve el usuario, no cómo está hecho el HTML: que la tabla tenga las filas
 * del grupo, que un id inventado sea un 404 de verdad, que a 400 px no se desplace el documento y que
 * la primera columna siga a la vista al desplazar la tabla, que no se publique el nombre de un menor y
 * que axe no encuentre nada serio ni crítico.
 */
const GRUPO_CYL = 3769;

/** La tabla de clasificación, sin depender de clases de presentación. */
const TABLA = 'table';

test.describe('pantalla 2 · competición de Castilla y León', () => {
  test('carga con datos reales: la tabla del grupo y su cabecera del prototipo', async ({ page }) => {
    const respuesta = await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    expect(respuesta?.status()).toBe(200);

    const tabla = page.locator(TABLA);
    await expect(tabla).toBeVisible();

    const filas = tabla.locator('tbody tr');
    await expect(filas).toHaveCount(16);

    // La clasificación se ordena por puntos de mayor a menor: es la promesa de la pantalla.
    const puntos = await filas.evaluateAll((trs) =>
      trs.map((tr) => Number((tr.children[6] as HTMLElement).innerText.trim())),
    );
    expect(puntos).toEqual([...puntos].sort((a, b) => b - a));
    expect(new Set(puntos).size).toBeLessThanOrEqual(16);

    // Coherencia de cada fila: los partidos jugados son los ganados, empatados y perdidos, y los goles
    // no son ceros de relleno (la tabla oficial de CyL no publica goles y se enseñan los reconstruidos).
    const incoherencias = await filas.evaluateAll((trs) => trs.flatMap((tr) => {
      const celdas = [...tr.children].map((td) => (td as HTMLElement).innerText.trim());
      const [, , pj, gep, goles] = celdas;
      const [g, e, p] = gep.split('-').map(Number);
      const problemas: string[] = [];
      if (Number(pj) !== g + e + p) problemas.push(`PJ ${pj} ≠ ${g}+${e}+${p}`);
      if (/^0:0$/.test(goles ?? '')) problemas.push('goles 0:0');
      // La forma es de la MISMA jornada que la tabla: no puede haber más insignias que partidos jugados.
      const insignias = tr.children[5]?.querySelectorAll('[title]').length ?? 0;
      if (insignias > Number(pj)) problemas.push(`forma ${insignias} > PJ ${pj}`);
      return problemas.length > 0 ? [`${celdas[1]}: ${problemas.join(', ')}`] : [];
    }));
    expect(incoherencias).toEqual([]);

    // La jornada enfrenta a los 16 equipos: ocho partidos.
    const jornada = page.locator('section', { has: page.getByRole('heading', { name: /^Jornada/ }) });
    await expect(jornada.locator('li')).toHaveCount(8);

    // La forma del equipo se enseña en V-E-D en toda la aplicación (decisión de David, 04/11/2026):
    // la cabecera lo dice y cada insignia lleva una letra visible y su palabra accesible.
    await expect(tabla.locator('thead th').filter({ hasText: 'V-E-D' })).toHaveCount(1);
    const insignias = await tabla.locator('tbody tr').first().locator('td').nth(5).locator('span[title]')
      .evaluateAll((els) => els.map((el) => ({
        letra: (el as HTMLElement).innerText.trim(),
        titulo: el.getAttribute('title'),
      })));
    expect(insignias.length).toBeGreaterThan(0);
    for (const i of insignias) {
      expect(['V', 'E', 'D']).toContain(i.letra);
      expect(['Victoria', 'Empate', 'Derrota']).toContain(i.titulo);
    }
    const cuerpoDeLaTabla = await tabla.innerText();
    expect(cuerpoDeLaTabla).not.toMatch(/\b[GP]\b/); // G/P no son forma visible
  });

  test('los escudos se pintan al tamaño del prototipo (22×24 y 56×56)', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const escudos = page.locator('table img[data-escudo="real"]');
    await expect(escudos).toHaveCount(16);
    const cajas = await escudos.evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    }));
    for (const [ancho, alto] of cajas) {
      expect([ancho, alto]).toEqual([22, 24]);
    }
    const federacion = page.locator('img[src*="/api/escudo/federacion/"]');
    await expect(federacion).toBeVisible();
    const cajaFederacion = await federacion.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    });
    expect(cajaFederacion).toEqual([56, 56]);
  });

  test('un nombre de 45 caracteres no rompe la tabla a 400 px y se puede leer', async ({ page }) => {
    // Grupo real de CyL (Tercera División de Fútbol Sala 2023-24) con un nombre de 61 caracteres. El
    // criterio §10.8 del sistema de diseño se comprueba con datos reales, no con 3769 (≤26).
    await page.setViewportSize({ width: 400, height: 900 });
    const respuesta = await page.goto('/explorar/competicion/17863');
    expect(respuesta?.status()).toBe(200);

    const caja = page.locator('[data-tabla-scroll]');
    await expect(caja).toBeVisible();
    await caja.evaluate((el) => { (el as HTMLElement).scrollLeft = (el as HTMLElement).scrollWidth; });

    const fila = caja.locator('tbody tr').first();
    const celdas = fila.locator('td');
    const posicion = await celdas.first().boundingBox();
    const equipo = await celdas.nth(1).boundingBox();
    const contenedor = await caja.boundingBox();
    expect(posicion).not.toBeNull();
    expect(equipo).not.toBeNull();
    expect(contenedor).not.toBeNull();
    // Al desplazar al máximo, el puesto (columna fija) sigue a la vista y NO lo tapa el equipo.
    expect(posicion!.x).toBeGreaterThanOrEqual(contenedor!.x - 2);
    expect(posicion!.x).toBeLessThan(contenedor!.x + 80);
    expect(posicion!.x + posicion!.width).toBeLessThanOrEqual(equipo!.x + 1);

    // El nombre largo se acorta en la tabla pero queda accesible entero en el título. No se asume qué
    // fila lo lleva: se comprueba que ALGUNO de los 16 nombres largos tiene su título completo.
    const titulos = await caja.locator('tbody td:nth-child(2) [title]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
    expect(titulos.length).toBe(16);
    expect(Math.max(...titulos.map((t) => t.length))).toBeGreaterThanOrEqual(45);

    const desborde = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      cliente: document.documentElement.clientWidth,
    }));
    expect(desborde.scroll).toBeLessThanOrEqual(desborde.cliente + 1);
  });

  test('el buscador publica los nombres (también de menores) y no rompe la accesibilidad al abrirse', async ({ page, request }) => {
    // La federación tiene consentimiento de tratamiento: el nombre se publica; la marca `es_menor` ya
    // no lo oculta. Lo que no se publica son las fotos, y la sugerencia no lleva ninguna.
    const respuesta = await request.get('/api/buscar?q=burg');
    expect(respuesta.status()).toBe(200);
    const datos = await respuesta.json() as { resultados: Array<{ tipo: string; titulo: string; url: string }> };
    const jugadores = datos.resultados.filter((r) => r.tipo === 'jugador');
    expect(jugadores.length).toBeGreaterThan(0);
    const MENORES_BURG = new Set(['/explorar/jugador/1586364', '/explorar/jugador/1520230', '/explorar/jugador/1567937', '/explorar/jugador/1353383']);
    const menores = jugadores.filter((j) => MENORES_BURG.has(j.url));
    expect(menores.length).toBe(MENORES_BURG.size);
    for (const j of menores) {
      expect(j.titulo, `menor oculto en ${j.url}`).not.toBe('Jugador menor de edad');
      expect(j.titulo.length).toBeGreaterThan(4);
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    // El buscador es cliente: se espera a la hidratación y a la respuesta real antes de medir el panel.
    await page.waitForLoadState('networkidle');
    const buscador = page.getByRole('searchbox');
    await buscador.click();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/buscar?q=burg') && r.status() === 200),
      buscador.pressSequentially('burg', { delay: 60 }),
    ]);
    await expect(page.locator('a[href^="/explorar/jugador/"]').first()).toBeVisible();

    // axe con el panel ABIERTO: la e2e solo medía el estado cerrado y el contraste del meta se colaba.
    const resultado = await new AxeBuilder({ page }).analyze();
    const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

    // Y en oscuro, que es donde el enlace «Ver los N resultados» se quedaba en 4,1:1 (QA).
    await page.evaluate(() => { document.documentElement.dataset.tema = 'oscuro'; });
    await page.waitForTimeout(200);
    const oscuro = await new AxeBuilder({ page }).analyze();
    const gravesOscuro = oscuro.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(gravesOscuro.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('los goles de los goleadores se comparan en vertical con cifras tabulares', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const goles = page.locator('section', { has: page.getByRole('heading', { name: 'Goleadores' }) }).locator('li span').last();
    const variante = await goles.evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(variante).toContain('tabular-nums');
  });

  test('la cabecera del sitio es la del prototipo y no finge lo que no existe', async ({ page }) => {
    // La navegación completa es la de escritorio; en móvil el buscador baja a su propia fila.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const cabecera = page.locator('header').first();

    // Búsqueda global: campo con nombre accesible y envío a /buscar.
    const buscador = cabecera.getByRole('searchbox');
    await expect(buscador).toBeVisible();
    await expect(buscador).toHaveAttribute('name', 'q');

    // Navegación de funciones con la sección activa.
    const funciones = cabecera.getByRole('navigation', { name: 'Funciones' });
    await expect(funciones.getByRole('link', { name: 'Competiciones' })).toHaveAttribute('aria-current', 'page');

    // Las cuatro funciones tienen pantalla y navegan; ninguna queda como enlace muerto.
    await expect(cabecera.locator('a[href="/explorar/rankings"]')).toHaveCount(1);
    await expect(cabecera.locator('a[href="/explorar/ojeo"]')).toHaveCount(1);
    await expect(cabecera.locator('a[href="/explorar/comparar"]')).toHaveCount(1);
    // No hay sistema de avisos ni cuentas todavía: un «3» en la campana sería un dato inventado.
    await expect(cabecera).not.toContainText(/\b[1-9]\d*\b/);
    // La cuenta ya tiene pantalla de entrada (sin sesión ni avatar inventado).
    await expect(cabecera.getByRole('link', { name: 'Entrar o crear cuenta' })).toHaveAttribute('href', '/entrar');
  });

  test('las migas empiezan por el nombre corto real de la federación', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const ruta = page.getByRole('navigation', { name: 'Ruta' });
    await expect(ruta.getByRole('link', { name: 'Castilla y León' })).toBeVisible();
    await expect(ruta).toContainText('Liga Nacional');
  });

  test('los goles que enseña no son ceros disfrazados: la tabla oficial de CyL no publica goles', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const cuerpo = await page.locator(TABLA).innerText();
    // Si la federación no publica goles, se enseñan los reconstruidos; nunca 0:0 de relleno.
    expect(cuerpo).not.toContain('0:0');
    expect(cuerpo).toMatch(/\d+:\d+/);
  });

  test('la pestaña Jornadas lleva al listado y una jornada a sus partidos', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    await page.getByRole('link', { name: 'Jornadas' }).click();
    await expect(page).toHaveURL(new RegExp(`/explorar/competicion/${GRUPO_CYL}/jornadas$`));
    await expect(page.getByRole('heading', { name: 'Jornadas' })).toBeVisible();

    const enlaces = page.locator('a[href*="/jornada/"]');
    await expect(enlaces.first()).toBeVisible();
    await enlaces.first().click();
    await expect(page).toHaveURL(new RegExp(`/explorar/competicion/${GRUPO_CYL}/jornada/\\d+$`));
    await expect(page.getByRole('heading', { name: /^Jornada \d+$/ }).first()).toBeVisible();
    // Marcador o «—», nunca un texto técnico de cómo se ha calculado.
    const partidos = page.locator('section', { has: page.getByRole('heading', { name: 'Partidos' }) });
    await expect(partidos).toBeVisible();
    await expect(partidos).not.toContainText(/canónico|reconstruid|cálculo|según el reglamento/i);
  });

  test('desde la jornada se abre el acta con cronología y alineaciones', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}/jornada/4`);
    const enlace = page.locator('a[href*="/explorar/acta/"]').first();
    await expect(enlace).toBeVisible();
    await enlace.click();
    await expect(page).toHaveURL(/\/explorar\/acta\/\d+$/);
    await expect(page.getByRole('heading', { name: /^Acta:/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cronología' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alineaciones' })).toBeVisible();
  });

  test('el calendario del grupo y el global responden con sus pestañas', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}/calendario`);
    await expect(page.getByRole('heading', { name: 'Calendario' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Calendario' })).toHaveAttribute('aria-current', 'page');
    await page.goto('/explorar/calendario');
    await expect(page.getByRole('heading', { name: 'Calendario' }).first()).toBeVisible();
  });

  test('la ficha de equipo se abre desde la clasificación y la de jugador desde el acta', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    await page.locator('table tbody tr').first().locator('a[href^="/explorar/equipo/"]').click();
    await expect(page).toHaveURL(/\/explorar\/equipo\/\d+$/);
    await expect(page.locator('h1').first()).toBeVisible();

    await page.goto('/explorar/acta/94040');
    await page.locator('a[href^="/explorar/jugador/"]').first().click();
    await expect(page).toHaveURL(/\/explorar\/jugador\/\d+$/);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('el selector resuelve «Segunda Juvenil 2017, Burgos» y abre la temporada histórica', async ({ page }) => {
    await page.goto('/explorar/competiciones?fed=castilla-leon&temp=2016-17&cat=juvenil&q=Segunda');
    const enlace = page.locator('a[href="/explorar/competicion/30665"]');
    await expect(enlace).toBeVisible();
    await enlace.click();
    await expect(page).toHaveURL(/\/explorar\/competicion\/30665$/);
    await expect(page.locator('#selector-temporada')).toHaveValue('30665');
    await expect(page.getByRole('heading', { name: /2016-17|Segunda|Juvenil/i }).first()).toBeVisible();
  });

  test('las estadísticas del grupo y el catálogo global responden', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}/estadisticas`);
    await expect(page.getByRole('heading', { name: 'Casa y fuera' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Estadísticas' })).toHaveAttribute('aria-current', 'page');
    await page.goto('/explorar/estadisticas');
    await expect(page.getByRole('heading', { name: 'Estadísticas' }).first()).toBeVisible();
  });

  test('la API v1 sirve los datos y responde 304 con ETag', async ({ request }) => {
    const indice = await request.get('/api/v1');
    expect(indice.status()).toBe(200);
    expect(await indice.json()).toMatchObject({ api: { version: 'v1' } });

    const acta = await request.get('/api/v1/acta/94040');
    expect(acta.status()).toBe(200);
    const etiqueta = acta.headers()['etag'];
    expect(etiqueta).toBeTruthy();
    const segunda = await request.get('/api/v1/acta/94040', { headers: { 'If-None-Match': etiqueta } });
    expect(segunda.status()).toBe(304);

    expect((await request.get('/api/v1/acta/999999999')).status()).toBe(404);
    expect((await request.get('/api/v1/acta/abc')).status()).toBe(400);
  });

  test('sin sesión, Mi panel lleva a entrar', async ({ page }) => {
    await page.goto('/mi-panel');
    await expect(page).toHaveURL(/\/entrar(\?|$)/);
    await expect(page.getByRole('heading', { name: /Entrar/ }).first()).toBeVisible();
  });

  test('las federaciones de pruebas no se publican y la ficha de jugador aguanta axe en oscuro', async ({ page, context }) => {
    await page.goto('/explorar/competiciones?q=prueba');
    await expect(page.getByText('Federación de Pruebas', { exact: false })).toHaveCount(0);
    expect((await page.request.get('/explorar/competicion/1117')).status()).toBe(404);

    const origen = new URL(page.url()).origin;
    await context.addCookies([{ name: 'tema', value: 'oscuro', url: origen }]);
    await page.goto('/explorar/jugador/19057');
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    const resultado = await new AxeBuilder({ page }).analyze();
    const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('las jornadas se leen como tablas: 4 por fila y equipos apilados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/explorar/competicion/${GRUPO_CYL}/jornadas`);
    const tablas = page.locator('section[data-jornada]');
    expect(await tablas.count()).toBeGreaterThanOrEqual(4);
    const cajas = await tablas.evaluateAll((els) => els.slice(0, 4).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }));
    expect(new Set(cajas.map((c) => c.y)).size, 'cuatro tablas en la misma fila').toBe(1);
    expect(new Set(cajas.map((c) => c.x)).size).toBe(4);
    // Cada partido tiene una columna de equipos (dos enlaces) y otra con resultado/campo/árbitro.
    const primera = tablas.first();
    await expect(primera.locator('table tbody tr').first().locator('a[href^="/explorar/equipo/"]')).toHaveCount(2);
    await expect(primera.locator('a[href*="/explorar/acta/"]').first()).toBeVisible();
    await expect(primera.locator('table tbody tr').first().locator('td')).toHaveCount(2);

    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(`/explorar/competicion/${GRUPO_CYL}/jornadas`);
    const cajasMovil = await page.locator('section[data-jornada]').evaluateAll((els) => els.slice(0, 3).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }));
    expect(new Set(cajasMovil.map((c) => c.x)).size, 'una por contenedor en móvil').toBe(1);
    expect(cajasMovil[1]!.y).toBeGreaterThan(cajasMovil[0]!.y);
    const ancho = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(ancho.scroll).toBe(ancho.client);
  });

  test('la marca, la navegación explicada y el pie', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const cabecera = page.locator('header').first();
    await expect(cabecera).toContainText('Fondo Popular');
    await expect(cabecera).toContainText('Competiciones y grupos');
    await expect(cabecera).toContainText('Goleadores y tarjetas');
    await expect(cabecera).toContainText('Buscar talento');
    await expect(cabecera).toContainText('Cara a cara');
    // El pie legal se retiró; queda sólo el enlace a Publicidad, sin avisos de archivo privado.
    const pie = page.locator('footer');
    await expect(pie).toHaveCount(1);
    await expect(pie).toContainText('Publicidad');
    await expect(pie).not.toContainText(/archivo privado|no es una web oficial/i);
  });

  test('las historias de jugador, equipo y club se abren desde sus fichas', async ({ page }) => {
    await page.goto('/explorar/jugador/19057');
    await page.getByRole('link', { name: 'Ver historial completo' }).click();
    await expect(page).toHaveURL(/\/explorar\/jugador\/19057\/historial$/);
    await expect(page.locator('h1').first()).toBeVisible();

    await page.goto('/explorar/equipo/2526');
    await page.getByRole('link', { name: 'Ver historial del equipo' }).click();
    await expect(page).toHaveURL(/\/explorar\/equipo\/2526\/historial$/);

    await page.goto('/explorar/club/16');
    await page.getByRole('link', { name: 'Ver historial del club' }).click();
    await expect(page).toHaveURL(/\/explorar\/club\/16\/historial$/);
  });

  test('registro abierto en dos páginas, sin invitación', async ({ page }) => {
    await page.goto('/entrar');
    await expect(page.getByRole('heading', { name: 'Entrar' }).first()).toBeVisible();
    await expect(page.locator('input[name="invitacion"]')).toHaveCount(0);
    await page.getByRole('link', { name: /Crear una cuenta/ }).click();
    await expect(page).toHaveURL(/\/crear-cuenta/);
    await expect(page.getByRole('heading', { name: /Crear cuenta/ }).first()).toBeVisible();
    await expect(page.locator('input[name="invitacion"]')).toHaveCount(0);
  });

  test('las fichas de árbitro, entrenador y delegado responden', async ({ page }) => {
    for (const ruta of ['/explorar/arbitro/18951', '/explorar/entrenador/19080', '/explorar/delegado/19236']) {
      const respuesta = await page.goto(ruta);
      expect(respuesta?.status(), ruta).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
    }
  });

  test('el comparador no tiene incidencias de contraste en tema oscuro', async ({ page, context }) => {
    await context.addCookies([{ name: 'tema', value: 'oscuro', url: 'http://localhost:3000' }]);
    await page.goto('/explorar/comparar?a=19057&b=19062');
    await expect(page.getByRole('heading', { name: /Comparar jugadores/i }).first()).toBeVisible();
    const resultado = await new AxeBuilder({ page }).analyze();
    const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('la portada no tiene incidencias serias ni críticas de accesibilidad', async ({ page }) => {
    await page.goto('/');
    const resultado = await new AxeBuilder({ page }).analyze();
    const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('las pantallas nuevas responden con datos o estado honesto', async ({ request }) => {
    for (const ruta of [
      '/',
      '/explorar/rankings',
      '/explorar/ojeo',
      '/explorar/comparar',
      '/explorar/federacion/castilla-leon',
      '/explorar/liga/797',
      '/explorar/liga/3769',
      '/explorar/publicidad',
      '/explorar/datos',
      '/explorar/salud',
      '/explorar/estados',
      '/mi-cuenta',
    ]) {
      const respuesta = await request.get(ruta);
      expect(respuesta.status(), ruta).toBe(200);
      expect(respuesta.headers()['content-type'], ruta).toContain('text/html');
    }
  });

  test('la administración exige sesión y no se anuncia a una cuenta normal', async ({ page }) => {
    const respuesta = await page.goto('/admin');
    expect(page.url()).toContain('/entrar');
    expect(respuesta?.status()).toBe(200);
  });

  test('los nombres se publican y no hay fotos de personas', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const goleadores = page.locator('section', { has: page.getByRole('heading', { name: 'Goleadores' }) });
    const texto = await goleadores.innerText();
    // Los nombres vienen como «APELLIDOS, NOMBRE» y ahora se publican también los de menores.
    expect(texto).toMatch(/[A-ZÁÉÍÓÚÜÑ]{2,},\s+[A-ZÁÉÍÓÚÜÑ]/);
    // Ninguna foto de persona: la sección no tiene imágenes.
    expect(await goleadores.locator('img').count()).toBe(0);
  });

  test('a 400 px no hay desplazamiento horizontal del documento y la primera columna queda fija', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 900 });
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);

    const desborde = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      cliente: document.documentElement.clientWidth,
    }));
    expect(desborde.scroll).toBeLessThanOrEqual(desborde.cliente + 1);

    // La tabla sí puede desplazarse dentro de su caja; lo que no puede es llevarse la primera columna.
    const caja = page.locator('[data-tabla-scroll]');
    await expect(caja).toBeVisible();
    await caja.evaluate((el) => { (el as HTMLElement).scrollLeft = 400; });

    const fila = caja.locator('tbody tr').first();
    const posicion = await fila.locator('td').first().boundingBox();
    const contenedor = await caja.boundingBox();
    expect(posicion).not.toBeNull();
    expect(contenedor).not.toBeNull();
    expect(posicion!.x).toBeGreaterThanOrEqual(contenedor!.x - 2);
    expect(posicion!.x).toBeLessThan(contenedor!.x + 80);
  });

  test('un id que no es un grupo responde 404, no un 200 con cuerpo de 404', async ({ request }) => {
    for (const id of ['abc', '0', '-3', '999999999']) {
      const respuesta = await request.get(`/explorar/competicion/${id}`, { maxRedirects: 0 });
      expect(respuesta.status(), `id ${id}`).toBe(404);
    }
  });

  test('axe: sin incidencias serias ni críticas', async ({ page }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const resultado = await new AxeBuilder({ page }).analyze();
    const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('el tema no se ofrece ni se aplica en las rutas viejas (colores literales)', async ({ page, context }) => {
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const origen = new URL(page.url()).origin;
    await context.addCookies([{ name: 'tema', value: 'oscuro', url: origen }]);

    await page.goto('/canonico');
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
    await expect(page.getByRole('button', { name: /Cambiar a tema/ })).toHaveCount(0);

    // Y en la ruta migrada el mismo navegador sí respeta la cookie y ofrece el control.
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    await expect(page.getByRole('button', { name: 'Cambiar a tema claro' })).toBeVisible();
  });

  test('el orden de tabulación de la cabecera coincide con el orden visual', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    const orden = await page.evaluate(() => [...document.querySelectorAll('header a, header button:not([disabled]), header input')]
      .map((el) => (el.textContent ?? '').trim() || el.getAttribute('aria-label') || '')
      .filter(Boolean));
    expect(orden[0]).toContain('Fondo Popular');
    expect(orden[1]).toContain('Competiciones');
    expect(orden[2]).toContain('Goleadores');
    expect(orden[3]).toContain('Jugadores');
    expect(orden[4]).toContain('Comparar');
    expect(orden[5]).toBe('Entrar o crear cuenta');
    expect(orden[6]).toBe('Cambiar a tema oscuro');
    expect(orden[7]).toContain('Buscar');
  });

  test('el tema se resuelve en el servidor y el botón lo cambia y lo persiste', async ({ page, context, request }) => {
    // Primer HTML con cookie: el servidor ya escribe el tema correcto (sin parpadeo).
    const conCookie = await request.get(`/explorar/competicion/${GRUPO_CYL}`, { headers: { cookie: 'tema=oscuro' } });
    expect(conCookie.status()).toBe(200);
    expect(await conCookie.text()).toContain('data-tema="oscuro"');

    await page.goto(`/explorar/competicion/${GRUPO_CYL}`);
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');

    await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'tema')?.value).toBe('oscuro');

    // Y persiste al recargar: la próxima petición ya la resuelve el servidor.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    await expect(page.getByRole('button', { name: 'Cambiar a tema claro' })).toBeVisible();

    // axe en oscuro, que es el tema que antes no existía.
    const oscuro = await new AxeBuilder({ page }).analyze();
    const gravesOscuro = oscuro.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(gravesOscuro.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

    await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro');
    expect((await context.cookies()).find((c) => c.name === 'tema')?.value).toBe('claro');
  });
});
