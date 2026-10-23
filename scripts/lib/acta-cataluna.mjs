/**
 * Interpretación de un acta de la FCF (Cataluña) ya leída del navegador (salida de EXTRAE_ACTA en
 * recolector-cataluna-datos.mjs) a la estructura común del proyecto: alineaciones con código de jugador,
 * capitán y portero; cuerpo técnico; goles; tarjetas; cambios; árbitros.
 *
 * Vive aquí, aparte del recolector, para poder probarla sin navegador (acta-cataluna.test.mjs).
 */

/** Roles del cuerpo técnico tal como los escribe la FCF (leídos de su propio diccionario).
 *
 *  Van de más largo a más corto porque hay roles de dos palabras («DELEGAT CAMP») y cortar por la
 *  primera palabra dejaba el nombre a medias o el rol con un apellido dentro. */
export const ROLES_TECNICOS = [
  'ENCARREGAT / DA MATERIAL O ALTRES', 'PREPARADOR FÍSIC, MERGE O A.T.S', 'ENTRENADOR/A AUXILIAR',
  'DELEGAT CAMP', 'DELEGAT EQUIP', 'COORDINADOR/A', 'PREPARADOR FÍSIC', 'ENTRENADOR/A', 'ENTRENADOR',
  'E.PORTERS', 'E. PORTERS', 'A.T.S.', 'AUXILIAR', 'MONITOR', 'DELEGAT',
].sort((a, b) => b.length - a.length);

export function parteTecnico(texto) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const mayusculas = limpio.toUpperCase();
  for (const rol of ROLES_TECNICOS) {
    if (mayusculas.startsWith(rol)) {
      return { rol, nombre: limpio.slice(rol.length).trim() };
    }
  }
  const palabras = limpio.split(' ');
  return { rol: (palabras[0] ?? '').toUpperCase(), nombre: palabras.slice(1).join(' ') };
}

/** Interpreta la ficha leída y la lleva a la estructura común del proyecto. */
export function interpretaActa(acta, equipos) {
  const seccion = (patron, indice = 0) => {
    const encontradas = acta.secciones.filter((s) => patron.test(s.titulo));
    return encontradas[indice] ?? null;
  };
  const [local, visitante] = equipos;
  const lineups = {
    local: { titulares: [], suplentes: [], portero: null },
    visitante: { titulares: [], suplentes: [], portero: null },
  };
  const tecnicos = [];
  const goles = [];
  const tarjetas = [];
  const cambios = [];
  const eventosDeFila = [];

  // Los bloques de cada equipo van seguidos y en el mismo orden que el marcador: primero el local.
  const TRIADAS = [['alineacions', 'suplents', 'equip tècnic'], ['alineacions', 'suplents', 'equip tècnic']];
  const usadas = new Set();
  for (const [indiceLado, lado] of ['local', 'visitante'].entries()) {
    for (const [posicion, nombreSeccion] of TRIADAS[indiceLado].entries()) {
      const bloque = acta.secciones.find((s, i) => !usadas.has(i) && s.titulo.toLowerCase().includes(nombreSeccion)
        && (posicion > 0 || s.filas.some((f) => f.nombre)));
      if (!bloque) continue;
      usadas.add(acta.secciones.indexOf(bloque));
      if (nombreSeccion.startsWith('alineacions') || nombreSeccion.startsWith('suplents')) {
        const destino = nombreSeccion.startsWith('alineacions') ? 'titulares' : 'suplentes';
        for (const fila of bloque.filas) {
          if (!fila.nombre) continue;
          const jugador = {
            codigoJugador: fila.jugador?.id ?? null,
            nombre: fila.nombre,
            dorsal: fila.dorsal ? Number(String(fila.dorsal).replace(/\D+/g, '')) || null : null,
          };
          if (String(fila.jugador?.capitan ?? '') === '1') jugador.capitan = true;
          lineups[lado][destino].push(jugador);
          const esPortero = (fila.posicion && /porter/i.test(fila.posicion)) || String(fila.jugador?.portero ?? '') === '1';
          if (esPortero && !lineups[lado].portero) lineups[lado].portero = fila.nombre;
          for (const ev of fila.eventos ?? []) eventosDeFila.push({ ...ev, lado, nombre: fila.nombre, codigo: fila.jugador?.id ?? null });
        }
      } else {
        for (const fila of bloque.filas) {
          const texto = fila.texto.replace(/\s+/g, ' ').trim();
          const { rol, nombre } = parteTecnico(texto);
          if (nombre) tecnicos.push({ lado, rol, nombre });
        }
      }
    }
  }

  // Con las alineaciones ya leídas, el nombre del jugador resuelve de qué lado es cada evento: es
  // más fiable que el escudo, que a veces no aparece o no coincide letra a letra.
  const normaliza = (valor) => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  const ladoPorNombre = (nombre) => {
    const clave = normaliza(nombre);
    if (!clave) return null;
    for (const lado of ['local', 'visitante']) {
      const plantilla = [...lineups[lado].titulares, ...lineups[lado].suplentes];
      if (plantilla.some((j) => normaliza(j.nombre) === clave)) return lado;
    }
    return null;
  };

  // Goles: cada fila es «1 - 0 NOMBRE (42') GOL NORMAL (EQUIPO)». El lado sale del marcador
  // acumulado (sube el número del equipo que marca) y, si no cuadra, del nombre del jugador.
  //
  // Cuando el partido acaba sin goles, la sección NO viene vacía: trae una fila de relleno («No hi ha
  // gols registrats»). Si se toma por un gol se inventa un goleador con nombre de frase, así que se
  // descartan las filas sin marcador al principio ni minuto.
  const TIPOS_GOL = { 'GOL NORMAL': 'normal', 'GOL PENAL': 'penalti', 'GOL PENALTI': 'penalti', 'GOL EN PRÒPIA': 'propia-puerta' };
  const RELLENO = /no\s+hi\s+ha|no\s+hay|sense\s+(?:gols|dades)|cap\s+gol|sin\s+datos|no\s+disponible/i;
  let marcadorPrevio = [0, 0];
  const limpia = (texto) => texto.replace(/^\d+\s*-\s*\d+\s*/, '').split('(')[0]
    .replace(/\d+['’].*$/, '').trim();
  for (const fila of seccion(/^gols$/i)?.filas ?? []) {
    const texto = fila.texto.replace(/\s+/g, ' ').trim();
    if (RELLENO.test(texto)) continue;
    const marcador = texto.match(/^(\d+)\s*-\s*(\d+)/);
    if (!marcador) continue;
    const jugador = limpia(texto);
    if (!jugador) continue;
    let lado = null;
    {
      const localAhora = Number(marcador[1]);
      const visitanteAhora = Number(marcador[2]);
      if (localAhora > marcadorPrevio[0] && visitanteAhora === marcadorPrevio[1]) lado = 'local';
      else if (visitanteAhora > marcadorPrevio[1] && localAhora === marcadorPrevio[0]) lado = 'visitante';
      else if (localAhora > marcadorPrevio[0]) lado = 'local';
      else if (visitanteAhora > marcadorPrevio[1]) lado = 'visitante';
      marcadorPrevio = [localAhora, visitanteAhora];
    }
    lado ??= ladoPorNombre(jugador)
      ?? (fila.imagenes.includes(visitante) && visitante ? 'visitante' : 'local');
    const minuto = (fila.minutos[0] ?? '').replace(/[^0-9]/g, '');
    const tipo = Object.keys(TIPOS_GOL).find((clave) => texto.toUpperCase().includes(clave)) ?? 'normal';
    goles.push({ jugador, lado, minuto: minuto ? Number(minuto) : null, tipo: TIPOS_GOL[tipo] ?? 'normal' });
  }
  const TIPOS_TARJETA = [[/GROGUES/i, 'amarilla'], [/DOBLES/i, 'roja'], [/VERMELLES/i, 'roja']];
  for (const [patron, tipo] of TIPOS_TARJETA) {
    for (const fila of seccion(patron)?.filas ?? []) {
      const texto = fila.texto.replace(/\s+/g, ' ').trim();
      const jugador = limpia(texto);
      if (!jugador) continue;
      const minuto = (fila.minutos[0] ?? '').replace(/[^0-9]/g, '');
      const lado = ladoPorNombre(jugador) ?? (fila.imagenes.includes(visitante) && visitante ? 'visitante' : 'local');
      tarjetas.push({ jugador, lado, minuto: minuto ? Number(minuto) : null, tipo });
    }
  }
  // Cambios: se emparejan las listas de «entra al camp» y «surt del camp» del mismo lado por orden.
  for (const lado of ['local', 'visitante']) {
    const filasDe = (patron) => (seccion(patron)?.filas ?? []).filter((f) => {
      const quien = limpia(f.texto.replace(/\s+/g, ' ').trim());
      return (ladoPorNombre(quien) ?? (f.imagenes.includes(visitante) && visitante ? 'visitante' : 'local')) === lado;
    });
    const entran = filasDe(/ENTRA AL CAMP/i);
    const salen = filasDe(/SURT DEL CAMP/i);
    for (const [i, sale] of salen.entries()) {
      const entra = entran[i];
      if (!entra) break;
      cambios.push({
        lado,
        saliente: limpia(sale.texto.replace(/\s+/g, ' ').trim()),
        entrante: limpia(entra.texto.replace(/\s+/g, ' ').trim()),
        minuto: Number((entra.minutos[0] ?? sale.minutos[0] ?? '').replace(/[^0-9]/g, '')) || null,
      });
    }
  }

  /*
   * Tarjetas y cambios desde los ICONOS de cada fila (22/10/2026), sólo si la ficha no los trae en secciones
   * propias (la FCF de hoy no las trae; el código de secciones de arriba se queda por si vuelven).
   * Cambios: en cada lado se empareja cada «sale» con un «entra» del MISMO minuto; lo que sobra, por orden.
   */
  if (!tarjetas.length) {
    for (const ev of eventosDeFila.filter((e) => e.tipo === 'amarilla' || e.tipo === 'roja')) {
      tarjetas.push({ jugador: ev.nombre, lado: ev.lado, minuto: Number.isFinite(ev.minuto) ? ev.minuto : null, tipo: ev.tipo });
    }
  }
  if (!cambios.length) {
    for (const lado of ['local', 'visitante']) {
      const salen = eventosDeFila.filter((e) => e.lado === lado && e.tipo === 'sale').sort((a, b) => a.minuto - b.minuto);
      const entran = eventosDeFila.filter((e) => e.lado === lado && e.tipo === 'entra').sort((a, b) => a.minuto - b.minuto);
      const usados = new Set();
      const parejas = [];
      for (const sale of salen) {
        const i = entran.findIndex((e, k) => !usados.has(k) && e.minuto === sale.minuto);
        if (i >= 0) { usados.add(i); parejas.push([sale, entran[i]]); } else parejas.push([sale, null]);
      }
      for (const par of parejas.filter(([, e]) => !e)) {
        const i = entran.findIndex((e, k) => !usados.has(k));
        if (i >= 0) { usados.add(i); par[1] = entran[i]; }
      }
      for (const [sale, entra] of parejas) {
        if (!entra) continue;
        cambios.push({ lado, saliente: sale.nombre, entrante: entra.nombre,
          minuto: Number.isFinite(entra.minuto) ? entra.minuto : (Number.isFinite(sale.minuto) ? sale.minuto : null) });
      }
    }
  }

  const arbitros = (seccion(/^àrbitres$/i)?.filas ?? []).map((f) => f.texto);
  return {
    parseada: { lineups, tecnicos, goles, tarjetas, cambios, golesLocal: acta.marcador?.[0] ?? null,
      golesVisitante: acta.marcador?.[1] ?? null },
    arbitros,
  };
}

/*
 * ── ACTAS LEÍDAS ANTES DE JUGARSE EL PARTIDO (22/10/2026) ──────────────────────────────────────────────────────
 *
 * La cola encola el acta cuando la FECHA DE LA JORNADA ya ha pasado, pero en Cataluña muchos partidos se juegan
 * otro día (entre semana, aplazados semanas): la ficha se leía con «Pendent», sin alineaciones ni marcador, y se
 * daba por HECHA. Nunca se volvía a pedir. Medido en la cola del 21/10 (temporada 2026-27): 3.262 actas hechas
 * «sin alineaciones», 655 leídas ANTES del día del partido (alguna citada para diciembre) y 996 el mismo día;
 * p. ej. la 4376482 se leyó el 05/10 por la mañana para un partido de las 20:00 y hoy está «Acta Tancada» 2-1
 * con 42 jugadores.
 *
 * Esta función decide, con lo leído, si el partido aún no tiene acta y cuándo volver. Sólo aplaza si la ficha
 * no trae alineaciones (con alineaciones se guarda siempre) y sólo en la temporada en curso (en una cerrada lo
 * que hay es lo que habrá: un partido que nunca se jugó no se pide cada semana para siempre).
 */
// Estados que dicen que el acta ya es la que habrá: cerrada, finalizado, suspendido o anulado. Cualquier otro
// estado conocido («Pendent», «Ajornat», un «Acta Oberta» aún sin cerrar…) es «todavía no».
const ESTADOS_FINALES = /tancad|finalitz|susp|anul/i;
// Ficha de un descanso: la FCF pone «undefined» o «TBD» en el equipo que libra. Ahí no habrá acta nunca.
const EQUIPO_LIBRE = /^(undefined|tbd|descans|null)?$/i;
const DIA_MS = 24 * 60 * 60_000;

/** «22.10.2026» o «2026-10-22» → «2026-10-22». */
export function fechaIsoDeFicha(valor) {
  const s = String(valor ?? '');
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

const sumaDias = (fechaIso, dias) => new Date(Date.parse(`${fechaIso}T06:00:00Z`) + dias * DIA_MS).toISOString();

/**
 * @param {{ estado?: string|null, marcador?: number[]|null, fecha?: string|null, titulares: number,
 *           temporadaEnCurso: boolean, hoy: string, equipos?: string[] }} ficha  `hoy` y `fecha` como «AAAA-MM-DD» (día de Madrid).
 * @returns {null | { hasta: string, motivo: string }}  null = guardar como siempre.
 */
export function decideActaSinJugar({ estado = null, marcador = null, fecha = null, titulares, temporadaEnCurso, hoy, equipos = [] }) {
  if (titulares > 0 || !temporadaEnCurso) return null;
  if (equipos.some((e) => EQUIPO_LIBRE.test(String(e ?? '').trim()))) return null;
  const textoEstado = String(estado ?? '').trim();
  if (textoEstado && ESTADOS_FINALES.test(textoEstado)) return null;
  const pendiente = Boolean(textoEstado);
  const futuraOHoy = Boolean(fecha) && fecha >= hoy;
  if (!pendiente && !(futuraOHoy && !marcador)) return null;
  // Un «Pendent» de hace más de 3 semanas ya no es un partido por jugar: es uno que no se jugó o cuya acta
  // la FCF no va a publicar. Se guarda como está (vacío) y deja de pedirse.
  if (fecha && fecha < sumaDias(hoy, -21).slice(0, 10)) return null;
  const desde = futuraOHoy ? fecha : hoy;
  // El día siguiente al partido (a las 06:00 UTC); si la ficha no da fecha o ya pasó, dentro de 3 días.
  const hasta = futuraOHoy ? sumaDias(desde, 1) : sumaDias(hoy, 3);
  const motivo = `partido sin jugar todavía (${estado ?? 'sin marcador'}${fecha ? `, ${fecha}` : ''}): se vuelve a mirar el ${hasta.slice(0, 10)}`;
  return { hasta, motivo };
}

/** Modalidades: sala (5), fútbol 7, fútbol 8, fútbol 9 y fútbol 11. */
const JUGADORES_POR_EQUIPO = new Set([5, 7, 8, 9, 11]);

/**
 * Calidad de la interpretación: se compara con dos datos independientes que publica la propia ficha.
 *
 *  El marcador del cabecero y la lista de goles vienen del mismo origen, así que cuando no cuadran es
 *  que la web no dice lo mismo en los dos sitios. Ocurre de verdad: la ficha 3783726 (L'HOSPITALET
 *  2-1 ESPANYOL) lista goles para un 1-2, probablemente porque el marcador se ajustó después por una
 *  alineación indebida. No se corrige nada por nuestra cuenta: se guarda el marcador oficial con la
 *  incidencia anotada para que se vea en el visor y lo revise una persona.
 */
export function evaluaCalidad(parseada) {
  const incidencias = [];
  if (parseada.golesLocal !== null && parseada.golesVisitante !== null) {
    const propios = { local: 0, visitante: 0 };
    for (const gol of parseada.goles ?? []) {
      // Un gol en propia puerta cuenta para el rival, que es como se refleja en el marcador.
      const lado = gol.tipo === 'propia-puerta' ? (gol.lado === 'local' ? 'visitante' : 'local') : gol.lado;
      if (lado === 'local' || lado === 'visitante') propios[lado] += 1;
    }
    if (!(parseada.goles ?? []).length && (parseada.golesLocal || parseada.golesVisitante)) {
      incidencias.push('sin_goles_leidos');
    } else if (propios.local !== parseada.golesLocal || propios.visitante !== parseada.golesVisitante) {
      incidencias.push(`goles_no_cuadran:${propios.local}-${propios.visitante}`);
    }
  }
  const local = parseada.lineups?.local?.titulares?.length ?? 0;
  const visitante = parseada.lineups?.visitante?.titulares?.length ?? 0;
  const titulares = local + visitante;
  // 22/10/2026: antes sólo valía 22, y todo el fútbol 7 (14), el 8 (16) y el sala (10) quedaba «a revisar»
  // (medido: 4.100 de 10.100 actas «revisar» de la 2026-27 eran eso). Vale cualquier modalidad conocida si los
  // dos equipos alinean lo mismo; lo demás (10 contra 11, uno vacío) sí se revisa.
  if (titulares === 0) incidencias.push('sin_alineaciones');
  else if (!(local === visitante && JUGADORES_POR_EQUIPO.has(local))) incidencias.push(`titulares:${titulares}`);
  return { calidad: incidencias.length ? 'revisar' : 'correcta', incidencias };
}
