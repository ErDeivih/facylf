#!/usr/bin/env node

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PERFILES = {
  madrid: {
    nombre: "Real Federación de Fútbol de Madrid",
    portal: "https://www.rffm.es",
    salida: "madrid-isquad-sondeo.json",
    async temporadas(pedir) {
      return normalizaLista(await pedir("/api/seasons"));
    },
    async modalidades(pedir) {
      return normalizaLista(await pedir("/api/game-types"));
    },
    async competiciones(pedir, temporada, modalidad) {
      return normalizaLista(
        await pedir(`/api/competitions?temporada=${encodeURIComponent(temporada)}&tipojuego=${encodeURIComponent(modalidad)}`),
      );
    },
    async grupos(pedir, competicion) {
      return normalizaLista(await pedir(`/api/groups?competicion=${encodeURIComponent(competicion)}`));
    },
  },
  valencia: {
    nombre: "Federación de Fútbol de la Comunidad Valenciana",
    portal: "https://ffcv.es/competiciones",
    salida: "valencia-isquad-sondeo.json",
    async temporadas(pedir) {
      return normalizaLista(await pedir("/competiciones/api/filtros/temporadas_fetch.php"), "temporadas");
    },
    async competiciones(pedir, temporada) {
      return normalizaLista(
        await pedir(`/competiciones/api/filtros/competiciones_fetch.php?temporada=${encodeURIComponent(temporada)}`),
        "competiciones",
      );
    },
    async grupos(pedir, competicion) {
      return normalizaLista(
        await pedir(`/competiciones/api/filtros/grupos_fetch.php?cod_competicion=${encodeURIComponent(competicion)}`),
        "grupos",
      );
    },
  },
};

const argumentos = procesaArgumentos(process.argv.slice(2));
const perfil = PERFILES[argumentos.federacion];
if (!perfil) {
  console.error("Uso: node scripts/sondeo-isquad.mjs --federacion madrid|valencia [--desde 2015]");
  process.exit(2);
}

const salida = resolve(argumentos.salida ?? `descargas-federacion-sondeo/${perfil.salida}`);
const esperaMinima = numeroNoNegativo(argumentos["pausa-min-ms"], 8_000);
const esperaMaxima = Math.max(esperaMinima, numeroNoNegativo(argumentos["pausa-max-ms"], 12_000));
const desde = numeroNoNegativo(argumentos.desde, 2015);
const maxTemporadas = numeroNoNegativo(argumentos["max-temporadas"], 0);
const maxCompeticiones = numeroNoNegativo(argumentos["max-competiciones"], 0);
const forzar = argumentos.forzar === true;
let primeraPeticion = true;

const documento = cargaDocumento(salida, perfil, argumentos.federacion);
const robots = await leeRobots(perfil.portal);
documento.robots = robots;
guardaDocumento(salida, documento);

async function pedir(ruta) {
  const url = new URL(ruta, `${perfil.portal}/`);
  if (!rutaPermitida(url.pathname, robots)) {
    throw new Error(`robots.txt no permite consultar ${url.pathname} con un agente genérico`);
  }
  if (!primeraPeticion) await pausaAleatoria(esperaMinima, esperaMaxima);
  primeraPeticion = false;
  process.stdout.write(`> ${url.pathname}${url.search}\n`);
  const respuesta = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
      "User-Agent": "FacylfBot/1.0 (proyecto personal; descubrimiento espaciado y reanudable)",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!respuesta.ok) throw new Error(`${respuesta.status} ${respuesta.statusText}: ${url}`);
  const texto = await respuesta.text();
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`Respuesta no JSON en ${url}`);
  }
}

const temporadasFuente = await perfil.temporadas(pedir);
let temporadas = temporadasFuente
  .map(normalizaTemporada)
  .filter((temporada) => anioInicial(temporada.nombre) >= desde)
  .sort((a, b) => anioInicial(b.nombre) - anioInicial(a.nombre));
if (maxTemporadas > 0) temporadas = temporadas.slice(0, maxTemporadas);
const modalidadesMadrid = argumentos.federacion === "madrid" ? await perfil.modalidades(pedir) : [];

for (const temporadaFuente of temporadas) {
  const temporada = insertaOActualiza(documento.temporadas, temporadaFuente, "codigo");
  const esTemporadaActual = temporada.codigo === temporadas[0]?.codigo;
  temporada.competiciones ??= [];
  temporada.descubrimiento ??= {};

  if (argumentos.federacion === "madrid") {
    temporada.modalidades = modalidadesMadrid.map(normalizaModalidad);
    for (const modalidad of temporada.modalidades) {
      const clave = `competiciones:${modalidad.codigo}`;
      if (forzar || esTemporadaActual || !temporada.descubrimiento[clave]) {
        const competiciones = await perfil.competiciones(pedir, temporada.codigo, modalidad.codigo);
        for (const item of competiciones) {
          insertaOActualiza(temporada.competiciones, normalizaCompeticion(item, modalidad), "codigo");
        }
        temporada.descubrimiento[clave] = new Date().toISOString();
        guardaDocumento(salida, documento);
      }
    }
  } else if (forzar || esTemporadaActual || !temporada.descubrimiento.competiciones) {
    const competiciones = await perfil.competiciones(pedir, temporada.codigo);
    for (const item of competiciones) {
      insertaOActualiza(temporada.competiciones, normalizaCompeticion(item), "codigo");
    }
    temporada.modalidades = modalidadesDesdeCompeticiones(temporada.competiciones);
    temporada.descubrimiento.competiciones = new Date().toISOString();
    guardaDocumento(salida, documento);
  }

  const pendientes = temporada.competiciones.filter(
    (competicion) =>
      forzar ||
      !competicion.grupos_descubiertos_en ||
      (esTemporadaActual && hanPasadoHoras(competicion.grupos_descubiertos_en, 24)),
  );
  const seleccion = maxCompeticiones > 0 ? pendientes.slice(0, maxCompeticiones) : pendientes;
  for (const competicion of seleccion) {
    const grupos = await perfil.grupos(pedir, competicion.codigo);
    competicion.grupos = grupos.map(normalizaGrupo);
    competicion.grupos_descubiertos_en = new Date().toISOString();
    guardaDocumento(salida, documento);
    process.stdout.write(`  OK competicion ${competicion.codigo}: ${competicion.grupos.length} grupo(s)\n`);
  }
}

documento.actualizado_en = new Date().toISOString();
documento.resumen = calculaResumen(documento);
guardaDocumento(salida, documento);
console.log(`OK Sondeo guardado en ${salida}`);
console.log(`  ${documento.resumen.temporadas} temporadas, ${documento.resumen.competiciones} competiciones, ${documento.resumen.grupos} grupos`);

function procesaArgumentos(lista) {
  const resultado = {};
  for (let indice = 0; indice < lista.length; indice += 1) {
    const token = lista[indice];
    if (!token.startsWith("--")) continue;
    const clave = token.slice(2);
    const siguiente = lista[indice + 1];
    if (!siguiente || siguiente.startsWith("--")) resultado[clave] = true;
    else {
      resultado[clave] = siguiente;
      indice += 1;
    }
  }
  return resultado;
}

function numeroNoNegativo(valor, predeterminado) {
  if (valor === undefined) return predeterminado;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : predeterminado;
}

function normalizaLista(valor, propiedad) {
  if (propiedad) {
    if (valor?.estado !== undefined && String(valor.estado) !== "1") {
      throw new Error(`La fuente devolvio estado=${valor.estado} para ${propiedad}`);
    }
    if (valor?.sesion_ok !== undefined && String(valor.sesion_ok) !== "1") {
      throw new Error(`La fuente devolvio sesion_ok=${valor.sesion_ok} para ${propiedad}`);
    }
    if (!Array.isArray(valor?.[propiedad])) {
      throw new Error(`Respuesta incompleta: falta la lista ${propiedad}`);
    }
    return valor[propiedad];
  }
  if (!Array.isArray(valor)) throw new Error("Respuesta incompleta: se esperaba una lista JSON");
  return valor;
}

function texto(valor) {
  return valor === undefined || valor === null ? "" : String(valor).trim();
}

function normalizaTemporada(item) {
  return {
    codigo: texto(item.cod_temporada ?? item.codigo),
    nombre: texto(item.nombre),
    fecha_inicio: texto(item.fecha_inicio) || null,
    fecha_fin: texto(item.fecha_fin) || null,
  };
}

function normalizaModalidad(item) {
  return {
    codigo: texto(item.codigo_tipo_juego ?? item.codigo),
    nombre: texto(item.nombre ?? item.TipoJuego),
  };
}

function normalizaCompeticion(item, modalidad) {
  return {
    codigo: texto(item.codigo ?? item.cod_competicion),
    nombre: texto(item.nombre),
    modalidad: modalidad ?? {
      codigo: texto(item.codigo_tipo_juego),
      nombre: texto(item.TipoJuego),
    },
    categoria: {
      codigo: texto(item.CodigoCategoria),
      nombre: texto(item.NombreCategoria),
    },
    grupo_categoria: {
      codigo: texto(item.cod_grupo_categoria),
      nombre: texto(item.nombre_grupo_categoria),
    },
    activa: texto(item.Activa) === "1",
    fecha_inicio: texto(item.FechaInicio) || null,
    fecha_fin: texto(item.FechaFin) || null,
    minutos_juego: numeroOpcional(item.minutos_juego),
    numero_partes: numeroOpcional(item.numero_partes),
  };
}

function normalizaGrupo(item) {
  return {
    codigo: texto(item.codigo ?? item.cod_grupo),
    nombre: texto(item.nombre),
    total_jornadas: numeroOpcional(item.total_jornadas),
    total_equipos: numeroOpcional(item.total_equipos),
    delegacion: texto(item.nombre_delegacion) || null,
    ver_clasificacion: texto(item.ver_clasificacion) === "1",
  };
}

function numeroOpcional(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function modalidadesDesdeCompeticiones(competiciones) {
  const mapa = new Map();
  for (const competicion of competiciones) {
    const modalidad = competicion.modalidad;
    if (modalidad?.codigo) mapa.set(modalidad.codigo, modalidad);
  }
  return [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

function insertaOActualiza(lista, nuevo, clave) {
  const existente = lista.find((item) => item[clave] === nuevo[clave]);
  if (!existente) {
    lista.push(nuevo);
    return nuevo;
  }
  const preservados = {
    grupos: existente.grupos,
    grupos_descubiertos_en: existente.grupos_descubiertos_en,
    competiciones: existente.competiciones,
    modalidades: existente.modalidades,
    descubrimiento: existente.descubrimiento,
  };
  Object.assign(existente, nuevo);
  for (const [nombre, valor] of Object.entries(preservados)) {
    if (valor !== undefined) existente[nombre] = valor;
  }
  return existente;
}

function anioInicial(nombre) {
  const coincidencia = texto(nombre).match(/(?:19|20)\d{2}/);
  return coincidencia ? Number(coincidencia[0]) : 0;
}

function hanPasadoHoras(fecha, horas) {
  const instante = Date.parse(fecha);
  return !Number.isFinite(instante) || Date.now() - instante >= horas * 60 * 60 * 1000;
}

function cargaDocumento(ruta, datosPerfil, codigo) {
  try {
    const existente = JSON.parse(readFileSync(ruta, "utf8"));
    existente.temporadas ??= [];
    return existente;
  } catch {
    return {
      version_esquema: 1,
      federacion: codigo,
      nombre: datosPerfil.nombre,
      portal: datosPerfil.portal,
      adaptador: "isquad-personalizado",
      temporadas: [],
      creado_en: new Date().toISOString(),
    };
  }
}

/** Renombrado con reintento: en Windows, si otro proceso (p. ej. el visor) tiene el fichero
 *  abierto un instante, el rename falla con EPERM/EBUSY. Se reintenta en vez de abortar. */
function renombraConReintento(temporal, destino) {
  for (let intento = 0; intento < 12; intento += 1) {
    try { renameSync(temporal, destino); return; }
    catch (error) {
      if (error?.code !== 'EPERM' && error?.code !== 'EBUSY') throw error;
      const hasta = Date.now() + 250;
      while (Date.now() < hasta) { /* espera breve */ }
    }
  }
  renameSync(temporal, destino);
}

function guardaDocumento(ruta, valor) {
  valor.actualizado_en = new Date().toISOString();
  valor.resumen = calculaResumen(valor);
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(valor, null, 2)}\n`, "utf8");
  renombraConReintento(temporal, ruta);
}

function calculaResumen(valor) {
  const competiciones = valor.temporadas.flatMap((temporada) => temporada.competiciones ?? []);
  return {
    temporadas: valor.temporadas.length,
    competiciones: competiciones.length,
    competiciones_con_grupos: competiciones.filter((competicion) => competicion.grupos_descubiertos_en).length,
    grupos: competiciones.reduce((total, competicion) => total + (competicion.grupos?.length ?? 0), 0),
  };
}

async function pausaAleatoria(minimo, maximo) {
  const espera = minimo + Math.floor(Math.random() * (maximo - minimo + 1));
  if (espera > 0) {
    process.stdout.write(`  ... pausa de ${Math.round(espera / 1000)} s\n`);
    await new Promise((resolver) => setTimeout(resolver, espera));
  }
}

async function leeRobots(portal) {
  const url = new URL("/robots.txt", portal);
  try {
    const respuesta = await fetch(url, {
      headers: { "User-Agent": "FacylfBot/1.0 (proyecto personal; descubrimiento espaciado y reanudable)" },
      signal: AbortSignal.timeout(15_000),
    });
    const contenido = await respuesta.text();
    return {
      url: url.href,
      estado_http: respuesta.status,
      disponible: respuesta.ok,
      reglas_agente_generico: reglasGenericas(contenido),
      consultado_en: new Date().toISOString(),
    };
  } catch (error) {
    return {
      url: url.href,
      estado_http: null,
      disponible: false,
      error: error instanceof Error ? error.message : String(error),
      reglas_agente_generico: [],
      consultado_en: new Date().toISOString(),
    };
  }
}

function reglasGenericas(contenido) {
  const reglas = [];
  let aplica = false;
  for (const lineaBruta of contenido.split(/\r?\n/)) {
    const linea = lineaBruta.replace(/#.*$/, "").trim();
    if (!linea) continue;
    const [campoBruto, ...resto] = linea.split(":");
    const campo = campoBruto.toLowerCase().trim();
    const valor = resto.join(":").trim();
    if (campo === "user-agent") {
      aplica = valor === "*";
    } else if (aplica && (campo === "allow" || campo === "disallow")) {
      reglas.push({ tipo: campo, ruta: valor });
    }
  }
  return reglas;
}

function rutaPermitida(ruta, robotsActual) {
  if (!robotsActual.disponible) return true;
  const candidatas = robotsActual.reglas_agente_generico
    .filter((regla) => regla.ruta && ruta.startsWith(regla.ruta))
    .sort((a, b) => b.ruta.length - a.ruta.length || (a.tipo === "allow" ? -1 : 1));
  return candidatas.length === 0 || candidatas[0].tipo === "allow";
}
