/** Lee jornadas, fechas y equipos de calendarios PNFG archivados. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';

const [raiz, temporada] = process.argv.slice(2);
const directorios = (ruta, prefijo) => readdirSync(ruta, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith(prefijo)).map((d) => d.name).sort();

function interpreta(html) {
  const cruces = [];
  const jornadas = new Set();
  for (const tabla of parse(html).querySelectorAll('table')) {
    const cabeza = tabla.querySelector('thead');
    if (!cabeza || cabeza.parentNode !== tabla || !cabeza.querySelector('[id^="fecha_jornada_org_"]')) continue;
    const jornada = Number(/\bJornada\s+(\d{1,3})\b/i.exec(cabeza.text)?.[1]);
    if (!jornada || jornadas.has(jornada)) return null;
    jornadas.add(jornada);
    const fecha = /\(\s*(\d\d)-(\d\d)-(\d{4})\s*\)/.exec(cabeza.text);
    const iso = fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null;
    const equipos = new Set();
    for (const marcador of tabla.querySelectorAll('td.anchogoles')) {
      const celdas = marcador.parentNode.childNodes.filter((n) => n.tagName === 'TD');
      if (celdas.length !== 3 || celdas[1] !== marcador) return null;
      const lados = [celdas[0], celdas[2]].map((celda) => {
        const href = celda.querySelector('a[href*="NFG_VisEquipos"]')?.getAttribute('href') ?? '';
        const codigo = /(?:Codigo_Equipo|codequipo)=(\d+)/i.exec(href)?.[1] ?? null;
        return { codigo, nombre: celda.text.trim() };
      });
      if (lados.some((e) => /^(descansa|descanso)$/i.test(e.nombre))) continue;
      const [local, visitante] = lados;
      const claves = lados.map((e) => e.codigo ?? e.nombre.toUpperCase());
      if (claves.some((k) => !k || equipos.has(k)) || claves[0] === claves[1]) return null;
      for (const clave of claves) equipos.add(clave);
      cruces.push({ jornada, fecha: iso, local, visitante });
    }
  }
  return cruces.length ? cruces : null;
}

const salida = [];
if (existsSync(raiz)) {
  for (const t of directorios(raiz, 't').filter((d) => d.endsWith(`-${temporada}`))) {
    for (const c of directorios(join(raiz, t), 'comp-')) {
      for (const g of directorios(join(raiz, t, c), 'grupo-')) {
        const carpeta = join(raiz, t, c, g);
        const archivo = ['calendario.html.gz', 'calendario.html'].map((n) => join(carpeta, n)).find(existsSync);
        if (!archivo) continue;
        let html;
        let observado;
        try {
          const bytes = readFileSync(archivo);
          html = (archivo.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
          observado = statSync(archivo).mtime.toISOString();
        } catch (error) {
          process.stderr.write(`Calendario omitido en ${c}/${g}: ${error.code ?? error.name}\n`);
          continue;
        }
        const cruces = interpreta(html);
        if (cruces) salida.push({ competicion: c.slice(5), grupo: g.slice(6), cruces, observado });
      }
    }
  }
}
process.stdout.write(JSON.stringify(salida));
