#!/usr/bin/env node
/**
 * Lleva los colores LITERALES de los componentes de la web a los ROLES del sistema de diseño.
 *
 * Es el paso que cierra la puerta P1 de `F:\LibraryUI\puertas.md` («un color literal en un componente es un
 * defecto»). El mapeo no es «el color más parecido»: es por FAMILIA (texto, fondo, borde) y por papel, y cada
 * decisión está escrita abajo. Los valores no se inventan: salen de `tokens.css`.
 *
 * Lo que NO hace: tocar `stroke=`/`fill=` de los gráficos (esos van a `currentColor` con una clase, porque un
 * atributo de SVG no es una declaración CSS) ni las clases ya tokenizadas (`text-club`, `bg-pizarra`, que en
 * `globals.css` apuntan a los tokens neutros).
 *
 * Uso: node scripts/arregla-colores-web.mjs [--aplicar]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const carpeta = join(raiz, 'apps', 'web', 'src', 'componentes');
const aplicar = process.argv.includes('--aplicar');

/*
 * hex → TOKEN. La familia de la clase se conserva (`text-` sigue siendo `text-`, `bg-` sigue siendo `bg-`):
 * lo único que cambia es el color, que pasa de un literal a un rol. El comentario dice QUÉ es, que es lo que
 * justifica el rol elegido.
 */
const MAPA = {
  // Texto secundario (gris medio): el que más se repite en el producto.
  '#5C646C': 'var(--texto-suave)',
  '#7C8085': 'var(--texto-suave)',
  // Texto terciario (gris claro): metadatos, contadores, pistas.
  '#8A8E91': 'var(--texto-tenue)',
  '#A6A9AD': 'var(--texto-tenue)',
  '#AFB2B6': 'var(--texto-tenue)',
  '#7C838B': 'var(--texto-tenue)',
  // Texto sobre superficie fuerte (panel oscuro del próximo partido, caja de búsqueda).
  '#F7F7F6': 'var(--texto-inverso)',
  '#C3CAD1': 'var(--texto-inverso)',
  // Con significado: aviso ámbar, derrota, texto normal.
  '#A87A12': 'var(--amarilla)',
  '#F4A0A6': 'var(--derrota)',
  '#16191D': 'var(--texto)',
  // Fondos.
  '#FAFBFA': 'var(--fondo-elevado)',
  '#EDF0ED': 'var(--fondo-sutil)',
  '#1F2328': 'var(--color-pizarra)',
  '#1F7A46': 'var(--victoria)',
  // Escala del mapa de calor: el mismo rojo en cuatro intensidades.
  '#8E1F26': 'var(--calor-3)',
  '#B64A50': 'var(--calor-2)',
  '#D98A8D': 'var(--calor-1)',
  // Bordes.
  '#D6D6D4': 'var(--borde)',
  '#C6C9C7': 'var(--borde)',
  '#3A4048': 'var(--borde-fuerte)',
  '#5A636C': 'var(--borde-fuerte)',
  '#8E2B31': 'var(--derrota)',
};

/*
 * Un mismo hex puede ser dos cosas distintas según su familia, y ahí no vale «conservar la familia»:
 * `#EDF0ED` como FONDO es la superficie sutil, pero como BORDE es un separador claro y le toca `--borde`.
 * Se declara aparte para que no se cuele un rol de fondo en un borde, que compila y se ve casi igual pero
 * deja de significar lo que dice.
 */
const EXCEPCIONES = [
  { familia: 'border', hex: '#EDF0ED', token: 'var(--borde)' },
];

let total = 0;
for (const nombre of readdirSync(carpeta).filter((f) => f.endsWith('.tsx'))) {
  const ruta = join(carpeta, nombre);
  const original = readFileSync(ruta, 'utf8');
  let texto = original;
  const cambios = [];
  for (const [hex, token] of Object.entries(MAPA)) {
    /*
     * Sólo dentro de una clase de Tailwind (`text-[#…]`, `bg-[#…]`, `border-[#…]`, `placeholder:text-[#…]`).
     * Los atributos de SVG (`stroke="#…"`, `fill="#…"`) NO se tocan aquí: en un atributo de presentación
     * `var()` no es una declaración CSS, así que esos van a `currentColor` con una clase, a mano.
     */
    for (const familia of ['text', 'bg', 'border', 'placeholder']) {
      for (const prefijo of [`${familia}-[${hex}]`, `placeholder:${familia}-[${hex}]`]) {
        if (!texto.includes(prefijo)) continue;
        const reemplazo = prefijo.replace(`[${hex}]`, `[${token}]`);
        texto = texto.split(prefijo).join(reemplazo);
        cambios.push(`${prefijo} → ${reemplazo}`);
      }
    }
  }
  for (const { familia, hex, token } of EXCEPCIONES) {
    for (const prefijo of [`${familia}-[${hex}]`, `placeholder:${familia}-[${hex}]`]) {
      if (!texto.includes(prefijo)) continue;
      const reemplazo = prefijo.replace(`[${hex}]`, `[${token}]`);
      texto = texto.split(prefijo).join(reemplazo);
      cambios.push(`${prefijo} → ${reemplazo}`);
    }
  }
  if (texto === original) continue;  total += cambios.length;
  console.log(`${nombre}: ${cambios.length} color(es)`);
  for (const c of cambios) console.log(`   ${c}`);
  if (aplicar) writeFileSync(ruta, texto);
}
console.log(`\n${total} reemplazo(s)${aplicar ? ' APLICADOS' : ' (en seco: usa --aplicar)'}`);
