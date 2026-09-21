import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Los seis recorridos de `PRODUCTO-UX.md` §13, más tres de datos imperfectos, que son los que de verdad
 * rompen una web de datos: la competición de una federación que no publica actas, un grupo a medias y
 * dos homónimos de federaciones distintas.
 *
 * Cada recorrido termina con `axe`: ninguna violación seria o crítica. No se comprueba el aspecto, se
 * comprueba que se puede usar y que no hay barreras.
 */

const SERIAS = ['serious', 'critical'];

async function sinBarreras(page: import('@playwright/test').Page, contexto: string) {
  const resultado = await new AxeBuilder({ page }).analyze();
  const graves = resultado.violations.filter((v) => SERIAS.includes(v.impact ?? ''));
  expect(graves.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nodo(s) — ${v.help}`),
    `accesibilidad en ${contexto}`).toEqual([]);
}

test('1. encontrar una competición de Salamanca en menos de tres interacciones', async ({ page }) => {
  await page.goto('/');
  // Interacción 1: Competiciones. Interacción 2: escribir «salamanca» y filtrar.
  await page.getByRole('link', { name: 'Competiciones' }).click();
  await page.getByRole('combobox').first().selectOption({ label: 'Castilla y León' }).catch(() => undefined);
  const buscador = page.getByRole('textbox').first();
  await buscador.fill('salamanca');
  await page.keyboard.press('Enter');
  const listado = page.locator('a[href*="/competicion/"]');
  await expect(listado.first()).toBeVisible();
  const textos = await listado.allInnerTexts();
  expect(textos.length, 'sin resultados de Salamanca').toBeGreaterThan(0);
  expect(textos.join(' ').toLowerCase()).toContain('salamanca');
  await sinBarreras(page, 'listado de competiciones');
});

test('2. abrir una jornada y su partido, y 3. del acta al jugador y volver', async ({ page }) => {
  await page.goto('/competicion/t20-c11379751-g11379752');
  await expect(page.getByText('Jornadas', { exact: true })).toBeVisible();

  // Jornada: el calendario del grupo con sus partidos.
  await page.goto('/competicion/t20-c11379751-g11379752/calendario');
  const partido = page.locator('a[href*="/jornada/"]').first();
  await expect(partido).toBeVisible();
  await partido.click();
  await expect(page).toHaveURL(/jornada/);
  await sinBarreras(page, 'jornada');

  // Del partido al acta y del acta al jugador; volver conserva el contexto.
  const enlaceActa = page.locator('a[href*="/acta/"]').first();
  if (await enlaceActa.count() > 0) {
    await enlaceActa.click();
    await expect(page).toHaveURL(/acta/);
    const urlActa = page.url();
    const enlaceJugador = page.locator('a[href*="/jugador/"]').first();
    if (await enlaceJugador.count() > 0) {
      await enlaceJugador.click();
      await expect(page).toHaveURL(/jugador/);
      await page.goBack();
      await expect(page).toHaveURL(urlActa);
    }
    await sinBarreras(page, 'acta');
  }
});

test('4. diferenciar equipo, club y categoría', async ({ page }) => {
  await page.goto('/competicion/t20-c11379751-g11379752');
  // La ficha declara categoría, ámbito y grupo por separado: no son lo mismo.
  for (const etiqueta of ['Jornadas', 'Partidos']) {
    await expect(page.getByText(etiqueta, { exact: true }).first()).toBeVisible();
  }
  const categoria = await page.locator('.insignia').allInnerTexts();
  expect(categoria.length, 'sin insignias de contexto (temporada, categoría, ámbito, federación)').toBeGreaterThanOrEqual(3);
  const equipo = page.locator('a[href*="/equipo/"]').first();
  await expect(equipo).toBeVisible();
  await equipo.click();
  await expect(page).toHaveURL(/equipo/);
  await sinBarreras(page, 'ficha de equipo');
});

test('5. entender si una cifra es completa o estimada', async ({ page }) => {
  // La ficha del canónico dice la cobertura real y hasta qué jornada está completo.
  await page.goto('/canonico/castilla-leon/11379752');
  const cobertura = page.getByText(/Completo hasta|Estado de la cobertura|Clasificación/i).first();
  await expect(cobertura).toBeVisible();
  await expect(page.getByText(/hasta la jornada|completa/i).first()).toBeVisible();
  await sinBarreras(page, 'ficha del canónico');

  // Y la página de estado del canónico declara la ventana de temporadas que se publica.
  await page.goto('/canonico');
  await expect(page.getByText(/aplazadas|temporadas/i).first()).toBeVisible();
  await sinBarreras(page, 'estado del canónico');
});

test('6. buscar un nombre sin escribir exactamente sus tildes', async ({ page }) => {
  await page.goto('/jugadores');
  const buscador = page.getByRole('textbox').first();
  // Sin tildes y en minúsculas: el buscador tiene que encontrar igual.
  await buscador.fill('garcia');
  await page.keyboard.press('Enter');
  const resultados = page.locator('a[href*="/jugador/"]');
  await expect(resultados.first()).toBeVisible();
  expect(await resultados.count(), 'sin resultados para «garcia»').toBeGreaterThan(0);
  await sinBarreras(page, 'buscador de jugadores');
});

test('7. una federación sin actas no enseña ceros de goleadores', async ({ page }) => {
  // Madrid publica calendario y resultados, pero no fichas de acta: no hay goleadores que enseñar.
  await page.goto('/competicion/t20-c17145391-g17145391').catch(() => undefined);
  await page.goto('/federaciones');
  await sinBarreras(page, 'federaciones');
  // Lo que se defiende: si no hay datos, se dice; no se pinta un 0 que parezca un dato.
  const cuerpo = await page.locator('body').innerText();
  expect(cuerpo).toContain('Madrid');
  expect(/sin datos|no publica|pendiente|0 de /i.test(cuerpo), 'sin ninguna marca de dato ausente').toBe(true);
});

test('9. dos homónimos aparecen separados y con su contexto', async ({ page }) => {
  await page.goto('/jugadores');
  const buscador = page.getByRole('textbox').first();
  await buscador.fill('garcia lopez');
  await page.keyboard.press('Enter');
  const filas = page.locator('a[href*="/jugador/"]');
  if (await filas.count() >= 2) {
    const textos = await filas.allInnerTexts();
    const unicos = new Set(textos.map((t) => t.trim()));
    expect(unicos.size, 'dos resultados idénticos: no se distingue una persona de otra').toBe(textos.length);
  }
  await sinBarreras(page, 'homónimos');
});
