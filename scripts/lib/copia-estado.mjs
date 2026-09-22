/*
 * ── QUÉ FICHEROS DE UNA FEDERACIÓN SON «ESTADO» Y CUÁLES SON «ARCHIVO» ─────────────────────────────────
 *
 * El traspaso de una federación del PC al servidor tiene dos pasadas:
 *
 *   1. **El estado** (esta lista + la instantánea de la cola): el catálogo de competiciones, las temporadas
 *      conocidas, el inventario de códigos y la base de la cola. Son unos pocos MB y son lo que hace que el
 *      servidor continúe el trabajo en vez de empezar de cero. El worker SE NIEGA a arrancar sin el catálogo
 *      (`No existe descargas-<fed>/competiciones-por-temporada.json`), así que esto es lo urgente.
 *   2. **El archivo** (`recolector-local/t11`…`t22`, los `.gz` con el HTML de cada acta): es la evidencia y pesa
 *      cientos de veces más. Se sincroniza después, sin prisa, y el PC conserva su copia.
 *
 * La distinción es por FORMA, no por una lista escrita a mano: todo lo que cuelga del primer nivel de la
 * carpeta del recolector y es un fichero pequeño de estado entra; los directorios de temporada (el archivo) no.
 *
 * Se separa aquí, en una función pura, para poder probarla sin tocar el disco ni el servidor.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Ficheros de estado que el recolector deja sueltos dentro de su carpeta. */
export const SUELTOS = ['temporadas.json', 'inventario-codigos.json.gz'];

/** Carpetas de la federación que NO son estado (caché del navegador, registro del PC, la cola van aparte). */
export const EXCLUIDOS = ['perfil-chrome'];

const esJson = (n) => /\.json(\.gz)?$/i.test(n);

/**
 * Lista, en rutas relativas con `/`, lo que hay que copiar para traspasar el ESTADO de una federación.
 *
 * @param {string} raiz raíz del proyecto en el PC (contiene `descargas-<fed>/`)
 * @param {string} federacion nombre de la federación
 * @param {{ existe?: Function, listar?: Function, esDirectorio?: Function }} [fs] inyectable para las pruebas
 * @returns {string[]}
 */
export function listaDeEstado(raiz, federacion, fs = {}) {
  const existe = fs.existe ?? existsSync;
  const listar = fs.listar ?? readdirSync;
  const esDirectorio = fs.esDirectorio ?? ((p) => statSync(p).isDirectory());

  const base = `descargas-${federacion}`;
  const carpeta = join(raiz, base);
  const dentro = join(carpeta, 'recolector-local');
  const rutas = [];

  // El catálogo y cualquier otro JSON suelto de la federación (`competiciones-por-temporada.json`).
  if (existe(carpeta)) {
    for (const nombre of listar(carpeta)) if (esJson(nombre) && !EXCLUIDOS.includes(nombre)) rutas.push(`${base}/${nombre}`);
  }

  // El estado del recolector: sólo el primer nivel. Los `t11`… son archivo y se copian en la otra pasada.
  if (existe(dentro)) {
    for (const nombre of listar(dentro)) {
      if (EXCLUIDOS.includes(nombre)) continue;
      if (nombre.startsWith('cola-v2.sqlite')) continue;      // la cola va por instantánea, no por tar
      if (/\.log$/i.test(nombre)) continue;                    // el registro es de ESTE PC, no del servidor
      const completa = join(dentro, nombre);
      if (esJson(nombre) || (nombre === 'rechazadas' && esDirectorio(completa))) {
        rutas.push(`${base}/recolector-local/${nombre}`);
      }
    }
  }

  return rutas.sort();
}

/*
 * ── VEREDICTO DE LA COMPROBACIÓN DE INTEGRIDAD ──────────────────────────────────────────────────────────
 *
 * Copiar una cola NO es copiar un fichero: es copiar una base de datos. Si en la carpeta de destino queda un
 * `cola-v2.sqlite-wal` de una sesión ANTERIOR del contenedor, SQLite intenta aplicar ese diario a un fichero
 * que no es el suyo y la base queda ilegible:
 *
 *     Error: database disk image is malformed
 *     errcode: 11
 *
 * Ocurrió el 21/09/2026 con las cuatro federaciones que ya habían arrancado una vez en el servidor (Galicia,
 * Madrid, Valencia y Extremadura: las otras cuatro no, porque su primer arranque murió antes de abrir la cola).
 *
 * Por eso el traspaso comprueba la integridad ABRIENDO la cola copiada dentro de la imagen del recolector, y
 * esto es lo que se lee de esa comprobación. Es una función pura a propósito: la verificación es justo la que
 * no puede permitirse el lujo de ser optimista, así que se prueba sola.
 */
export function veredictoDeIntegridad(salida) {
  const texto = String(salida ?? '');
  const integridad = /integridad=([^\s]+)/.exec(texto);
  const peticiones = /peticiones=(\d+)/.exec(texto);
  const pendientes = /pendientes=(\d+)/.exec(texto);
  if (/NO ABRE|Error:|error:/.test(texto) || !integridad) {
    return {
      ok: false,
      motivo: texto.trim().split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 200) ?? 'sin salida de la comprobación',
      peticiones: peticiones ? Number(peticiones[1]) : null,
      pendientes: pendientes ? Number(pendientes[1]) : null,
    };
  }
  return {
    ok: integridad[1] === 'ok',
    motivo: integridad[1] === 'ok' ? 'íntegra' : `integridad=${integridad[1]}`,
    peticiones: peticiones ? Number(peticiones[1]) : null,
    pendientes: pendientes ? Number(pendientes[1]) : null,
  };
}

/*
 * ── ¿SE PUEDE COPIAR ESTA COLA AHORA MISMO? ─────────────────────────────────────────────────────────────
 *
 * No, si su recolector está en marcha. Y no por prudencia: `scp` no renombra el fichero, lo ABRE Y LO
 * REESCRIBE. Si el recolector lo tiene abierto, ve cómo le cambian las páginas debajo mientras su propio
 * `-wal` sigue describiendo la base vieja, y el resultado es una base ilegible. Medido el 22/09/2026 en el
 * servidor: Madrid, Murcia y Valencia, copiadas con sus contenedores dentro, quedaron las tres con
 * «database disk image is malformed» y en bucle de caída cada 300 s.
 *
 * Para copiar hay que parar el contenedor (no se pierde nada: el trabajo `en_curso` vuelve a `pendiente` al
 * arrancar), copiar y volver a levantarlo. `--forzar` es para el caso raro —una federación que nunca se ha
 * levantado—, no para saltarse esto por comodidad.
 */
export function decisionDeCopia({ contenedorEnMarcha, forzar = false } = {}) {
  if (contenedorEnMarcha && !forzar) {
    return {
      copiar: false,
      motivo: 'el recolector está en marcha: copiar con él dentro deja la cola ilegible (páralo y repite)',
    };
  }
  return {
    copiar: true,
    motivo: forzar && contenedorEnMarcha ? 'forzado con el recolector en marcha' : 'adelante',
  };
}
