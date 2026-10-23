/**
 * ── VIGÍA DE LAS COLAS: reglas para enterarse PRONTO de que una federación va mal (22/10/2026) ────────────────
 *
 * Por qué existe. En una semana se escaparon tres fallos que «pedían sin errores» y aun así estaban mal:
 *   · Cataluña guardaba calendarios con 29 de 30 jornadas vacías (2025-26 con 21.000 de ~150.000 partidos);
 *   · la pasada del fin de semana mandaba las jornadas de 14 federaciones a la web de Castilla y León;
 *   · el arreglo de Cataluña guardaba los partidos sin fecha (0 actas encoladas en 187 calendarios).
 * Ninguno daba error. Los tres se ven en tres números que nadie miraba: a qué portal se pide, qué parte de lo
 * leído viene vacío, y si lo leído deja actas en cola. Aquí están esas reglas y las de siempre (parada, bloqueo,
 * errores, ritmo), como funciones PURAS: reciben las métricas ya medidas y devuelven avisos. Se prueban sin
 * colas ni red (`vigia-colas.test.mjs`); quien mide es `scripts/vigia-colas.mjs`.
 *
 * Niveles: «critico» (hay que actuar hoy: se pide a quien no se debe, nos bloquean, disco), «aviso» (algo
 * no cuadra: parada, errores, lecturas vacías, ritmo hundido) e «info» (contexto, no avisa a nadie).
 */

/** Federaciones que recoge cada máquina (21/10/2026). CyL va en las dos (temporadas alternas). */
export const REPARTO = {
  pc: ['federacion', 'madrid', 'andalucia', 'cataluna', 'valencia', 'bizkaia', 'gipuzkoa', 'araba', 'laspalmas', 'tenerife'],
  servidor: ['federacion', 'galicia', 'navarra', 'aragon', 'asturias', 'baleares', 'cantabria', 'castilla-la-mancha',
    'extremadura', 'murcia', 'canarias', 'ceuta', 'melilla', 'rioja', 'euskadi'],
};

/** Portal de las federaciones que no tienen `perfiles/<fed>.json` (las PNFG lo sacan de su perfil). */
export const PORTAL_FIJO = { federacion: 'www.rfcylf.es', cataluna: 'www.fcf.cat', valencia: 'ffcv.es', madrid: 'www.rffm.es' };

export const UMBRALES = {
  paradaMin: 90,            // sin pedir nada con trabajo vencido y sin pausa (PC: una plaza por federación)
  paradaMinServidor: 600,   // en el servidor 14 federaciones se turnan 4 plazas: esperar unas horas es normal
  arranqueMin: 30,          // tras encender la máquina, margen antes de dar nada por parado
  erroresMin: 10,           // errores «malos» en 1 h para avisar…
  erroresProporcion: 0.3,   // …y que sean al menos esta parte de lo pedido
  vaciasMin: 20,            // jornadas jugadas leídas en 24 h para poder hablar de proporción
  vaciasProporcion: 0.25,   // parte de esas lecturas que vienen sin partidos
  sinActasMin: 30,          // jornadas jugadas con partidos leídas en 24 h…
  sinActasProporcion: 0.8,  // …de las que esta parte no dejan ni un acta en cola (o hecha)
  ritmoProporcion: 0.4,     // peticiones de 24 h frente a la mediana diaria de la semana
  ritmoProporcionServidor: 0.25, // en el servidor las plazas van por turnos y el ritmo diario baila más
  ritmoMinimoDia: 500,      // por debajo de esta mediana no se juzga el ritmo
  pausaLargaH: 6,
  calidadSalto: 0.25,
  sinPublicarSalto: 0.35,
  atrasadosProporcion: 0.3, // jornadas de la semana pasada sin ningún marcador   // subida de la parte «aún no publicado» frente a la mediana de la semana       // subida de la parte de actas sin alineaciones/ilegibles frente a su semana
  riquezaMin24: 30,         // actas con alineaciones leídas en 24 h para juzgar su riqueza…
  riquezaMin7: 100,         // …y en la semana anterior
  riquezaCaida: 0.33,       // avisa si la parte con tarjetas/cambios/códigos baja de un tercio de la de su semana
  discoCriticoGb: 5,
  memoriaAvisoGb: 2,
  recordatorioH: 6,         // un aviso que sigue vivo se recuerda cada tantas horas
};

/** Errores que NO son nuestros: la fuente no publica o publica vacío. No cuentan como fallo. */
export const ERRORES_DE_LA_FUENTE = [
  /viene vacía/i, /no publica/i, /todavía no/i, /aún no/i, /sin datos/i, /identificador negativo/i,
  /no se pudo descubrir el índice/i, /ausente/i,
];

export function esErrorDeLaFuente(detalle) {
  return ERRORES_DE_LA_FUENTE.some((re) => re.test(String(detalle ?? '')));
}

const mediana = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Avisos de UNA federación. `m` son sus métricas (ver `scripts/vigia-colas.mjs`), `ctx` el contexto de la
 * máquina: `{ maquina, ahora, uptimeMin, propias:Set }`.
 */
export function evaluaFederacion(m, ctx, u = UMBRALES) {
  const avisos = [];
  const pon = (nivel, codigo, texto) => avisos.push({ federacion: m.federacion, nivel, codigo, texto });
  const propia = ctx.propias?.has(m.federacion) ?? true;
  const ahora = ctx.ahora ?? Date.now();
  const pausaViva = m.pausaHasta && Date.parse(m.pausaHasta) > ahora;

  if (m.error) { pon('aviso', 'ilegible', `no se pudo leer la cola: ${m.error}`); return avisos; }

  // 1. Portal ajeno: se pide a una web que no es la de esta federación. Es lo más grave: molesta a un tercero y
  //    todo lo que devuelve es basura (así se quedaron 500 jornadas vacías en 14 federaciones).
  //    Se mira la ventana de 6 h (lo que pasa AHORA); si no viene medida, la de 24 h.
  const ajenos = Object.entries(m.hosts6 ?? m.hosts24 ?? {}).filter(([h]) => m.portal && h !== m.portal && h !== '?');
  if (ajenos.length) {
    pon('critico', 'portal_ajeno', `${ajenos.reduce((s, [, n]) => s + n, 0)} peticiones en ${m.hosts6 ? '6' : '24'} h a otro portal `
      + `(${ajenos.map(([h, n]) => `${h} ×${n}`).join(', ')}); el suyo es ${m.portal}`);
  }

  // 2. Bloqueo explícito de la web.
  const bloqueos1h = m.resultados1h?.bloqueo ?? 0;
  if (bloqueos1h > 0 || (pausaViva && /\b(403|429)\b|bloque|niega|deneg/i.test(m.pausaMotivo ?? ''))) {
    pon('critico', 'bloqueo', `la web nos niega el acceso (${bloqueos1h} bloqueos en 1 h${pausaViva ? `; pausa hasta ${m.pausaHasta.slice(0, 16)}: ${String(m.pausaMotivo ?? '').slice(0, 90)}` : ''})`);
  } else if (pausaViva && Date.parse(m.pausaHasta) - ahora > u.pausaLargaH * 3600e3) {
    pon('aviso', 'pausa_larga', `en pausa hasta ${m.pausaHasta.slice(0, 16)}: ${String(m.pausaMotivo ?? '').slice(0, 100)}`);
  }

  if (!propia) return avisos; // copia de otra máquina: sólo interesa si alguien la usa para pedir a otro portal

  // 3. Parada: tiene trabajo vencido, no está en pausa y lleva rato sin pedir nada.
  const minSinPedir = m.ultimaPeticion ? (ahora - Date.parse(m.ultimaPeticion)) / 60000 : Infinity;
  const umbralParada = ctx.maquina === 'servidor' ? u.paradaMinServidor : u.paradaMin;
  if (!pausaViva && (m.vencido ?? 0) > 0 && minSinPedir > umbralParada && (ctx.uptimeMin ?? Infinity) > u.arranqueMin) {
    pon('aviso', 'parada', `${Number.isFinite(minSinPedir) ? `${Math.round(minSinPedir)} min` : 'nunca'} sin pedir nada con ${m.vencido} trabajos vencidos`);
  }

  // 4. Errores nuestros (los de la fuente no cuentan).
  const malos = m.errores1hNuestros ?? 0;
  const total1h = Object.values(m.resultados1h ?? {}).reduce((s, n) => s + n, 0);
  if (malos >= u.erroresMin && malos >= total1h * u.erroresProporcion) {
    pon('aviso', 'errores', `${malos} de ${total1h} peticiones fallan en la última hora; el más repetido: «${String(m.errorTop1h ?? '').slice(0, 90)}»`);
  }

  // 5. Lecturas vacías: jornadas YA jugadas de las dos últimas temporadas que se leyeron sin un partido.
  if ((m.jornadasLeidas24 ?? 0) >= u.vaciasMin && m.jornadasVacias24 / m.jornadasLeidas24 > u.vaciasProporcion) {
    pon('aviso', 'lecturas_vacias', `${m.jornadasVacias24} de ${m.jornadasLeidas24} jornadas jugadas leídas en 24 h vienen sin partidos `
      + `(${Math.round(100 * m.jornadasVacias24 / m.jornadasLeidas24)} %): o la web no las publica o el lector no las ve`);
  }

  // 6. Lo leído no deja actas: jornadas jugadas con partidos con código y ni un acta en cola ni hecha.
  if ((m.jornadasConPartidos24 ?? 0) >= u.sinActasMin && m.jornadasSinActas24 / m.jornadasConPartidos24 > u.sinActasProporcion) {
    pon('aviso', 'sin_actas', `${m.jornadasSinActas24} de ${m.jornadasConPartidos24} jornadas jugadas leídas en 24 h no dejan ningún acta en cola `
      + '(¿partidos sin fecha o sin código?)');
  }

  // 7. Calendarios incompletos (Cataluña).
  if ((m.calendariosIncompletos24 ?? 0) >= 10 && m.calendariosIncompletos24 > (m.calendariosLeidos24 ?? 0) * 0.2) {
    pon('aviso', 'calendarios_incompletos', `${m.calendariosIncompletos24} calendarios incompletos en 24 h (de ${m.calendariosIncompletos24 + (m.calendariosLeidos24 ?? 0)} intentos)`);
  }

  // 7b. El lector se rompe: de repente muchas más actas «sin alineaciones» o ilegibles que en su semana (cambio de
  //     maquetación de la web). Se compara la parte de las últimas 24 h con la de los 7 días anteriores.
  //     Por temporada, porque mezclarlas engaña: las de base de temporadas cerradas no traen alineaciones.
  //     Y (22/10/2026) un lector roto rompe TODAS las competiciones a la vez; una sola competición que sale vacía
  //     es la fuente (Cataluña: la División de Honor Juvenil, nacional, que la FCF no publica; CyL: benjamines de
  //     2019-20). Si la medida trae el detalle por competición, hacen falta al menos dos rotas; con una sola, «info».
  const porTempComp = new Map();
  for (const c of m.calidadPorCompeticion ?? []) {
    if (c.n24 < 20 || c.n7 < 20) continue;
    const x = porTempComp.get(c.etiqueta) ?? { candidatas: 0, rotas: [] };
    x.candidatas += 1;
    if (c.m24 / c.n24 - c.m7 / c.n7 > u.calidadSalto) x.rotas.push(c);
    porTempComp.set(c.etiqueta, x);
  }
  const saltos = (m.calidadPorTemporada ?? []).filter((t) => t.n24 >= 50 && t.n7 >= 100)
    .map((t) => ({ ...t, p24: t.m24 / t.n24, p7: t.m7 / t.n7 })).filter((t) => t.p24 - t.p7 > u.calidadSalto)
    .filter((t) => {
      if (!m.calidadPorCompeticion) return true;
      const x = porTempComp.get(t.etiqueta);
      if (x && x.rotas.length >= 2) return true;
      const una = x?.rotas?.[0];
      pon('info', 'calidad_una_competicion', `${t.etiqueta}: la subida de actas sin alineaciones viene de ${una ? `una sola competición (${una.nombre || una.c}: ${una.m24} de ${una.n24} en 24 h)` : 'competiciones con poca muestra'}; suele ser la fuente, no el lector`);
      return false;
    });
  if (saltos.length) {
    pon('aviso', 'calidad_actas', saltos.map((t) => `${t.etiqueta}: ${Math.round(100 * t.p24)} % de las actas de 24 h sin alineaciones o ilegibles `
      + `frente al ${Math.round(100 * t.p7)} % de su semana`).join('; ') + ' — ¿ha cambiado la web o el lector?');
  }

  // 7b'. Riqueza de las actas: la parte con tarjetas, con cambios o con código de jugador se hunde frente a su
  //      semana (p. ej. la web cambia los iconos y el lector deja de reconocerlos). Sólo caídas fuertes y con
  //      base: antes al menos un 30 %, ahora menos de un tercio de eso.
  const caidas = [];
  for (const t of m.riquezaPorTemporada ?? []) {
    if (t.n24 < u.riquezaMin24 || t.n7 < u.riquezaMin7) continue;
    for (const [dato, a24, a7, b24, b7] of [['tarjetas', t.tarj24, t.tarj7, t.n24, t.n7], ['cambios', t.camb24, t.camb7, t.n24, t.n7],
      ['códigos de jugador', t.cod24, t.cod7, t.jug24, t.jug7]]) {
      const p24 = b24 ? a24 / b24 : 0; const p7 = b7 ? a7 / b7 : 0;
      if (p7 >= 0.3 && p24 < p7 * u.riquezaCaida) caidas.push(`${t.etiqueta}: ${dato} en el ${Math.round(100 * p24)} % (su semana: ${Math.round(100 * p7)} %)`);
    }
  }
  // Igual que la calidad: si hay detalle por competición, la caída tiene que verse en al menos dos competiciones.
  if (caidas.length && m.riquezaPorCompeticion) {
    const rotas = new Set();
    for (const c of m.riquezaPorCompeticion) {
      if (c.n24 < 10 || c.n7 < 20) continue;
      for (const [a24, a7, b24, b7] of [[c.tarj24, c.tarj7, c.n24, c.n7], [c.camb24, c.camb7, c.n24, c.n7], [c.cod24, c.cod7, c.jug24, c.jug7]]) {
        const p24 = b24 ? a24 / b24 : 0; const p7 = b7 ? a7 / b7 : 0;
        if (p7 >= 0.3 && p24 < p7 * u.riquezaCaida) rotas.add(`${c.t}|${c.c}`);
      }
    }
    if (rotas.size < 2) caidas.length = 0;
  }
  if (caidas.length) pon('aviso', 'riqueza_actas', `${caidas.join('; ')} — ¿ha cambiado la ficha del acta?`);

  // 7c. Casi todo «aún no publicado» de repente: la web ha cambiado y el lector cree que no hay nada.
  const medSp = mediana(m.sinPublicarPorDia7 ?? []);
  if (m.sinPublicar24 != null && medSp != null && (m.peticiones24 ?? 0) >= 100 && m.sinPublicar24 - medSp > u.sinPublicarSalto) {
    pon('aviso', 'sin_publicar_salto', `${Math.round(100 * m.sinPublicar24)} % de lo pedido en 24 h sale «aún no publicado», frente al ${Math.round(100 * medSp)} % habitual: ¿ha cambiado la web?`);
  }

  // 7d. Resultados atrasados: jornadas de la temporada en curso jugadas hace 2-9 días sin ningún marcador.
  const sp7 = m.semanaPasada;
  if (sp7 && sp7.jornadas >= 20 && sp7.sinResultados / sp7.jornadas > u.atrasadosProporcion) {
    pon('aviso', 'resultados_atrasados', `${sp7.sinResultados} de ${sp7.jornadas} jornadas jugadas hace 2-9 días siguen sin ningún resultado`);
  }

  // 8. Ritmo hundido frente a su propia semana.
  const med = mediana(m.peticionesPorDia7 ?? []);
  const propRitmo = ctx.maquina === 'servidor' ? u.ritmoProporcionServidor : u.ritmoProporcion;
  if (!pausaViva && med && med >= u.ritmoMinimoDia && (m.peticiones24 ?? 0) < med * propRitmo && (m.vencido ?? 0) > 0) {
    pon('aviso', 'ritmo_bajo', `${m.peticiones24} peticiones en 24 h frente a una mediana de ${Math.round(med)} al día`);
  }

  if (!(m.vencido ?? 0) && !(m.aplazado ?? 0)) pon('info', 'sin_trabajo', 'sin trabajo pendiente');
  return avisos;
}

/** Avisos de la máquina (disco y memoria). */
export function evaluaMaquina(maq, u = UMBRALES) {
  const avisos = [];
  if (Number.isFinite(maq.discoLibreGb) && maq.discoLibreGb < u.discoCriticoGb) {
    avisos.push({ federacion: '(máquina)', nivel: 'critico', codigo: 'disco', texto: `${maq.discoLibreGb.toFixed(1)} GB libres en disco` });
  }
  if (Number.isFinite(maq.memoriaLibreGb) && maq.memoriaLibreGb < u.memoriaAvisoGb) {
    avisos.push({ federacion: '(máquina)', nivel: 'aviso', codigo: 'memoria', texto: `${maq.memoriaLibreGb.toFixed(1)} GB de memoria libre` });
  }
  return avisos;
}

/**
 * Compara los avisos de ahora con los que ya estaban vivos: qué es NUEVO (se avisa), qué SIGUE (se recuerda cada
 * `recordatorioH` horas) y qué se ha RESUELTO (se dice una vez). `previos` es el estado guardado de la pasada
 * anterior: `{ clave: { primeraVez, ultimoAviso, nivel, texto } }`.
 */
export function comparaConAnteriores(actuales, previos = {}, ahora = Date.now(), u = UMBRALES) {
  const estado = {};
  const nuevos = []; const recordar = []; const resueltos = [];
  for (const a of actuales.filter((x) => x.nivel !== 'info')) {
    const clave = `${a.federacion}|${a.codigo}`;
    const p = previos[clave];
    if (!p) {
      nuevos.push(a);
      estado[clave] = { primeraVez: new Date(ahora).toISOString(), ultimoAviso: new Date(ahora).toISOString(), nivel: a.nivel, texto: a.texto };
    } else {
      const toca = ahora - Date.parse(p.ultimoAviso) >= u.recordatorioH * 3600e3;
      if (toca) recordar.push({ ...a, desde: p.primeraVez });
      estado[clave] = { ...p, nivel: a.nivel, texto: a.texto, ultimoAviso: toca ? new Date(ahora).toISOString() : p.ultimoAviso };
    }
  }
  for (const [clave, p] of Object.entries(previos)) {
    if (!estado[clave]) {
      const [federacion, codigo] = clave.split('|');
      resueltos.push({ federacion, codigo, desde: p.primeraVez, texto: p.texto });
    }
  }
  return { estado, nuevos, recordar, resueltos };
}
