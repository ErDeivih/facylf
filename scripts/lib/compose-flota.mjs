/*
 * QUÉ FEDERACIONES TIENE LA FLOTA SEGÚN SU COMPOSE.
 *
 * `ajustar-flota.mjs` necesita saber qué servicios son recolectores y de qué federación, sin leer el compose a
 * mano y sin añadir una dependencia de YAML: la lista sale de la propia configuración que Compose resuelve
 * (`docker compose config`), que es lo que de verdad se va a levantar. Si la lista estuviera escrita dos veces
 * —una en el compose y otra en el guion—, una federación nueva se quedaría fuera del ajuste sin que nadie se
 * enterase.
 *
 * Se aceptan las dos formas en que Compose imprime los servicios (JSON y YAML) porque no todas las versiones
 * tienen `--format json`.
 */

/** El comando de un servicio, en lista o en texto, tal y como lo imprime Compose. */
function comoLista(comando) {
  if (Array.isArray(comando)) return comando.map((t) => String(t).trim());
  return String(comando ?? '').split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

/** De un `command`, saca la federación que se le pasa al guion de recolección (o `null` si no es un recolector). */
export function federacionDelComando(comando) {
  const partes = comoLista(comando);
  const indice = partes.findIndex((t) => /entrada-recolector\.sh$/.test(t));
  if (indice < 0) return null;
  const federacion = partes[indice + 1];
  return federacion && !federacion.startsWith('-') ? federacion : null;
}

/** Servicios de un `docker compose config --format json`. */
export function serviciosDeComposeJson(configuracion) {
  const servicios = configuracion?.services ?? {};
  return Object.entries(servicios)
    .map(([servicio, definicion]) => ({ servicio, federacion: federacionDelComando(definicion?.command) }))
    .filter((s) => s.federacion)
    .sort((a, b) => a.federacion.localeCompare(b.federacion));
}

/**
 * Servicios de un `docker compose config` en YAML. No es un analizador de YAML: sólo busca, en el bloque de cada
 * servicio de primer nivel, la llamada al guion de recolección y el argumento que le sigue.
 */
export function serviciosDeComposeYaml(texto) {
  const lineas = String(texto ?? '').split(/\r?\n/);
  const servicios = [];
  let actual = null;
  let bloque = [];
  const cierra = () => {
    if (!actual) return;
    const federacion = federacionDelComando(bloque.join('\n').replace(/^\s*-\s*/gm, ' '));
    if (federacion) servicios.push({ servicio: actual, federacion });
    actual = null;
    bloque = [];
  };
  let enServicios = false;
  for (const linea of lineas) {
    if (/^services:\s*$/.test(linea)) { enServicios = true; continue; }
    if (enServicios && /^\S/.test(linea)) { cierra(); enServicios = false; continue; }
    if (!enServicios) continue;
    const cabecera = /^ {2}([A-Za-z0-9_.-]+):\s*$/.exec(linea);
    if (cabecera) { cierra(); actual = cabecera[1]; continue; }
    if (actual) bloque.push(linea);
  }
  cierra();
  return servicios.sort((a, b) => a.federacion.localeCompare(b.federacion));
}

/**
 * ¿Se puede tocar la flota?
 *
 * Sólo si se sabe de verdad cómo está. Medido el 19/09/2026: con el disco lleno, el demonio de Docker dejó de
 * responder y `ajustar-flota.mjs` informó de «0 contenedores en marcha» y de dieciséis federaciones «sin
 * contenedor creado» — falso: los contenedores existían. Un `--aplicar` en ese momento habría intentado parar y
 * levantar a ciegas. Desconocido no es cero, tampoco aquí.
 */
export function puedeActuar({ demonioVivo, decisiones } = {}) {
  if (!demonioVivo) {
    return {
      ok: false,
      motivo: 'el demonio de Docker no responde: no se sabe qué contenedores están en marcha, así que no se toca nada',
    };
  }
  if (!Array.isArray(decisiones) || decisiones.length === 0) {
    return { ok: false, motivo: 'no hay federaciones que ajustar' };
  }
  return { ok: true, motivo: '' };
}

/** Estado de los contenedores a partir de `docker compose ps --format json` (lista o una línea por objeto). */
export function interpretaComposePs(salida) {  let filas = [];
  const texto = String(salida ?? '').trim();
  if (texto.startsWith('[')) {
    try { filas = JSON.parse(texto); } catch { filas = []; }
  } else {
    for (const linea of texto.split(/\r?\n/)) {
      if (!linea.trim()) continue;
      try { filas.push(JSON.parse(linea)); } catch { /* línea que no es JSON: se ignora */ }
    }
  }
  const estado = new Map();
  for (const fila of filas) {
    const servicio = fila?.Service ?? fila?.service;
    if (!servicio) continue;
    const estadoCrudo = String(fila?.State ?? fila?.state ?? '').toLowerCase();
    const salud = String(fila?.Health ?? fila?.health ?? '').toLowerCase();
    estado.set(servicio, {
      nombre: fila?.Name ?? fila?.name ?? null,
      enMarcha: estadoCrudo === 'running' || estadoCrudo.startsWith('up') || salud === 'healthy',
      estado: estadoCrudo || 'desconocido',
    });
  }
  return estado;
}
