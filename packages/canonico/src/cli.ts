#!/usr/bin/env node
/**
 * CLI del importador.
 *
 *   pnpm importar --federacion castilla-y-leon --grupo <codigo> [--temporada 2025-26]
 *   pnpm importar --federacion castilla-y-leon --temporada 2025-26        # todos sus grupos
 *   pnpm importar --federacion castilla-y-leon --temporada 2025-26 --continuar   # sin detenerse por un grupo roto
 *   pnpm importar --federacion castilla-y-leon --grupo <codigo> --seco    # no escribe; informa
 *   pnpm importar --estado --federacion castilla-y-leon                   # lotes y cobertura
 *   pnpm importar --revertir <batch_id>
 *   pnpm importar --retirar <lote.json> [--aplicar]                       # retirada con diario, reversible
 *
 * Siempre imprime al terminar: entidades creadas y actualizadas por tabla, filas rechazadas con su
 * motivo, y la comparación de recuentos origen/destino.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { creaPool, canonicoDisponible } from '../src/destino/pool.js';
import { importaFederacion, type InformeGrupo } from '../src/lote.js';
import { estadoLotes, revierteLote } from '../src/reversion.js';
import { aplicaRetirada, ordenaParaBorrar, type FilaARetirar, type SolicitudRetirada } from '../src/retirada.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Las credenciales viven en `.env` (nunca versionado). Se cargan aquí, sin dependencias: el contrato
// de la CLI es que `pnpm importar` funcione tal cual después de `pnpm db:arrancar`.
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try {
    process.loadEnvFile(rutaEnv);
  } catch (error) {
    console.warn(`· No se pudo leer ${rutaEnv}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type Argumentos = {
  federacion?: string;
  temporada?: string;
  grupo?: string;
  seco: boolean;
  estado: boolean;
  /** No detener la importación cuando un grupo falla: anotarlo y seguir. Ver `OpcionesLote.continuar`. */
  continuar: boolean;
  /** Carga masiva sin diario de cambios: el lote no se podrá revertir después. Ver `OpcionesLote.diario`. */
  sinDiario: boolean;
  revertir?: number;
  /** Ruta de un lote de RETIRADA preparado. Sin `--aplicar` sólo se informa de lo que haría. */
  retirar?: string;
  aplicar: boolean;
};

function leeArgumentos(argumentos: string[]): Argumentos {
  const salida: Argumentos = { seco: false, estado: false, aplicar: false, continuar: false, sinDiario: false };
  for (let i = 0; i < argumentos.length; i += 1) {
    const actual = argumentos[i]!;
    if (actual === '--federacion') salida.federacion = argumentos[++i];
    else if (actual === '--temporada') salida.temporada = argumentos[++i];
    else if (actual === '--grupo') salida.grupo = argumentos[++i];
    else if (actual === '--seco') salida.seco = true;
    else if (actual === '--continuar') salida.continuar = true;
    else if (actual === '--sin-diario') salida.sinDiario = true;
    else if (actual === '--estado') salida.estado = true;
    else if (actual === '--revertir') salida.revertir = Number(argumentos[++i]);
    else if (actual === '--retirar') salida.retirar = argumentos[++i];
    else if (actual === '--aplicar') salida.aplicar = true;
    else if (actual.startsWith('--')) throw new Error(`Argumento desconocido: ${actual}`);
  }
  return salida;
}

/**
 * Lee un lote de retirada preparado por `scripts/preparar-lote-canonico-descansos.mjs`.
 *
 * El fichero guarda el CIERRE por tabla —lo que hay que retirar, con las filas enteras— y no una lista de
 * claves: la fila completa es lo que permite reponerla. Aquí sólo se aplana a la forma que espera
 * `aplicaRetirada`; el orden lo pone ella.
 */
function leeLoteDeRetirada(ruta: string): SolicitudRetirada[] {
  const contenido = JSON.parse(readFileSync(ruta, 'utf8')) as {
    lotes?: Array<{
      federacion: string; temporada?: string; competicion?: string; grupo?: string;
      nombre_del_hueco?: string; aplicable?: boolean; impedimentos?: string[];
      /** Motivo del lote. Si no viene, se usa el de las inscripciones de descanso, que fue el primer caso. */
      motivo?: string;
      cierre?: Array<{ tabla: string; filas: Array<Record<string, unknown>> }>;
    }>;
  };
  const lotes = contenido.lotes ?? [];
  if (lotes.length === 0) throw new Error(`El fichero ${ruta} no trae ningún lote`);
  return lotes.map((lote) => {
    const filas: FilaARetirar[] = [];
    for (const tabla of lote.cierre ?? []) {
      for (const fila of tabla.filas) {
        // La clave NO se escribe aquí: la lee `aplicaRetirada` de la clave primaria real de la tabla. Dar por
        // hecho que todas se identifican con `id` es el error que ya costó una tanda de pruebas fallidas:
        // `core.match_report` no tiene `id`.
        filas.push({ tabla: tabla.tabla, fila });
      }
    }
    return {
      federacion: lote.federacion,
      motivo: lote.motivo?.trim()
        || `inscripción fantasma de descanso «${lote.nombre_del_hueco ?? '?'}» retirada del canónico`,
      temporada: lote.temporada, competicion: lote.competicion, grupo: lote.grupo,
      filas,
    };
  });
}

function imprimeInforme(informe: InformeGrupo): void {
  const cabecera = `t${informe.etiquetaTemporada} c${informe.competicion} g${informe.grupo}`;
  console.log(`\n=== ${informe.federacion} · ${cabecera} · lote ${informe.batchId} · ${(informe.milisegundos / 1000).toFixed(1)} s`);
  console.log('  entidades escritas:');
  const tablas = Object.entries(informe.contadores).sort((a, b) => (b[1].insertadas + b[1].actualizadas) - (a[1].insertadas + a[1].actualizadas));
  for (const [tabla, cuenta] of tablas) {
    console.log(`    ${tabla.padEnd(30)} +${String(cuenta.insertadas).padStart(6)}  ~${String(cuenta.actualizadas).padStart(6)}`);
  }
  console.log('  recuentos origen → destino:');
  for (const comprobacion of informe.validacion.comprobaciones) {
    console.log(`    ${comprobacion.ok ? '✓' : '✗'} ${comprobacion.nombre}: ${comprobacion.detalle}`);
  }
  if (informe.validacion.diferencias.length > 0) {
    for (const diferencia of informe.validacion.diferencias) {
      console.log(`    ✗ ${diferencia.entidad}: origen ${diferencia.origen} ≠ destino ${diferencia.destino}`);
    }
  }
  if (informe.rechazadas.length > 0) {
    console.log(`  filas rechazadas: ${informe.rechazadas.length}`);
    for (const rechazada of informe.rechazadas.slice(0, 10)) console.log(`    · ${rechazada.motivo}: ${rechazada.fila}`);
  }
  const c = informe.cobertura;
  console.log(`  cobertura: jornadas ${c.jornadas_descubiertas}/${c.jornadas_esperadas ?? '?'} · partidos ${c.partidos_conocidos} `
    + `(con resultado ${c.partidos_con_resultado}) · actas parseadas ${c.actas_parseadas} · completa hasta J${c.complete_through_matchday ?? '—'} · ${c.visibility_state}`);
  if (informe.diarioSustituido > 0) {
    console.log(`  diario: ${informe.diarioSustituido} filas del diario anterior de este mismo grupo borradas (ese lote ya no era reversible; éste sí)`);
  } else if (informe.diarioSustituido < 0) {
    console.warn('  ⚠ no se pudo limpiar el diario de lotes anteriores de este grupo (el lote actual sí es reversible)');
  }
  if (informe.partidosReparados > 0) {
    console.warn(`  ⚠ equipos reasignados: ${informe.partidosReparados} partido(s) del calendario traían una pareja de equipos `
      + 'que se contradecía con la de su propio acta. Manda el acta (es el documento del partido) y la '
      + `contradicción queda registrada. Apariciones obsoletas retiradas: ${informe.aparicionesRetiradas}.`);
  }
  if (informe.calendario && informe.calendario.desviados.length > 0) {
    const c = informe.calendario;
    console.warn(`  ⚠ calendario: ${c.desviados.length} de ${c.equipos} equipos juegan un número de partidos distinto del habitual `
      + `(${c.partidosHabitual} en ${c.equiposHabitual} equipos). En una liga regular todos juegan lo mismo, así que el `
      + 'emparejamiento de algún partido no cuadra (posible equipo mal asignado en la fuente). '
      + 'Queda registrado en ops.normalizacion_error; el importador no corrige el calendario por su cuenta.');
    for (const d of c.desviados.slice(0, 4)) {
      console.warn(`    · ${d.equipo}: ${d.partidos} partidos · ${d.descansos} ${d.descansos === 1 ? 'jornada' : 'jornadas'} sin jugar`);
    }
  }
  if (informe.calendario && informe.calendario.emparejamiento.anomalias.length > 0) {
    const { parejas, anomalias } = informe.calendario.emparejamiento;
    console.warn(`  ⚠ emparejamiento: ${anomalias.length} de ${parejas} parejas de equipos no pueden ser las de un calendario real. `
      + 'El emparejamiento es independiente del recuento por equipo: delata partidos mal asignados que el recuento compensa.');
    for (const a of anomalias.slice(0, 4)) {
      console.warn(`    · ${a.local} ↔ ${a.visitante}: ${a.enfrentamientos} enfrentamientos`
        + (a.enElMismoCampo ? ' y todos en el mismo campo' : ''));
    }
  }
  if (informe.clasificacionOficial) {
    const { filas, diferencias, sinResolver, comparada, fuente, resueltasPorClub, ajustes, rutaAlternativa, cotejadaConLaOtra } = informe.clasificacionOficial;
    console.log(`  clasificación oficial: ${filas} filas archivadas · fuente ${fuente === 'json' ? 'clasificacion.json' : 'clasificacion.html'}`
      + (cotejadaConLaOtra ? ' · las dos maquetas archivadas coinciden' : '')
      + (!cotejadaConLaOtra && rutaAlternativa ? ' · la otra maqueta estaba archivada pero no produjo filas' : '')
      + (comparada ? ` · ${diferencias.length} equipos difieren de la reconstruida` : ' · temporada en curso: no se contrasta con la reconstruida')
      + (resueltasPorClub > 0 ? ` · ${resueltasPorClub} equipos resueltos por nombre de club (la fuente publica otra letra de equipo)` : '')
      + (sinResolver > 0 ? ` · ${sinResolver} equipos sin resolver (no se escribió)` : ''));
    if (ajustes.length > 0) {
      console.log(`    · ${ajustes.length} equipo(s) con puntuación publicada por debajo de sus resultados (ajuste de la federación, se guarda el valor publicado y se registra):`);
      for (const a of ajustes.slice(0, 4)) {
        console.log(`        ${a.equipo}: publicado ${a.publicado} · sus resultados dan ${a.deResultados} · sanción declarada ${a.sancion}`);
      }
    }
    if (comparada && diferencias.length === 0) {
      console.log('    ✓ la reconstruida coincide con la oficial: el calendario y la tabla de la federación dicen lo mismo');
    }
    for (const diferencia of diferencias.slice(0, 4)) {
      console.log(`    · ${diferencia.equipo}: oficial ${diferencia.oficial} pts, reconstruida ${diferencia.reconstruida}`);
    }
  }
}

async function principal(): Promise<void> {
  const opciones = leeArgumentos(process.argv.slice(2));
  const disponible = await canonicoDisponible();
  if (!disponible.disponible) {
    console.error(`✗ El canónico no está disponible: ${disponible.motivo}`);
    console.error('  Arranca Docker Desktop y ejecuta `pnpm db:arrancar && pnpm db:migrar`.');
    process.exit(2);
  }
  const pool = creaPool();
  try {
    if (opciones.revertir !== undefined) {
      const informe = await revierteLote(pool, opciones.revertir);
      console.log(`Lote ${informe.batchId} revertido: ${informe.borradas} filas borradas, ${informe.restauradas} restauradas, `
        + `${informe.reinsertadas} REPUESTAS (las que ese lote había retirado), ${informe.conservadas} conservadas (las necesita otro lote).`);
      for (const fallo of informe.fallos) console.log(`  · conservada en ${fallo.tabla}: ${fallo.motivo}`);
      return;
    }
    if (opciones.retirar !== undefined) {
      const lotes = leeLoteDeRetirada(opciones.retirar);
      for (const lote of lotes) {
        const filas = ordenaParaBorrar(lote.filas);
        const porTabla = new Map<string, number>();
        for (const f of filas) porTabla.set(f.tabla, (porTabla.get(f.tabla) ?? 0) + 1);
        console.log(`\n=== retirada · ${lote.federacion} · ${lote.motivo}`);
        for (const [tabla, n] of porTabla) console.log(`  ${String(n).padStart(5)} × ${tabla}`);
        if (!opciones.aplicar) {
          console.log('  (nada escrito: para retirar de verdad, `--aplicar`)');
          continue;
        }
        const informe = await aplicaRetirada(pool, lote);
        console.log(`  lote ${informe.batchId}: ${informe.borradas} filas retiradas con diario`
          + ` · se deshace con \`pnpm importar --revertir ${informe.batchId}\``);
      }
      return;
    }
    if (opciones.estado) {
      const estado = await estadoLotes(pool, opciones.federacion);
      console.log('Últimos lotes:');
      for (const lote of estado.lotes) {
        console.log(`  ${String(lote.id).padStart(6)} ${lote.federacion.padEnd(18)} ${String(lote.estado).padEnd(10)} +${lote.insertadas} ~${lote.actualizadas} rechazadas ${lote.rechazadas} · ${lote.cursor ?? ''}`);
      }
      if (estado.cobertura.length > 0) {
        console.log('\nCobertura por grupo:');
        for (const fila of estado.cobertura) {
          console.log(`  grupo ${fila.grupo} · partidos ${fila.con_resultado}/${fila.partidos} · actas ${fila.actas_parseadas} · hasta J${fila.hasta_jornada ?? '—'} · ${fila.visibilidad}`);
        }
      }
      return;
    }
    if (!opciones.federacion) {
      console.error('Falta --federacion. Usa `--estado` para ver los lotes o `--revertir <id>`.');
      process.exit(1);
      return;
    }
    const informes = await importaFederacion(pool, {
      raiz: RAIZ,
      federacion: opciones.federacion,
      temporada: opciones.temporada,
      grupo: opciones.grupo,
      seco: opciones.seco,
      continuar: opciones.continuar,
      diario: !opciones.sinDiario,
    });
    if (informes.length === 0) {
      console.log('No hay grupos con datos que importar en ese ámbito.');
      return;
    }
    let insertadas = 0;
    let actualizadas = 0;
    let rechazadas = 0;
    let correctos = 0;
    const fallidos: InformeGrupo[] = [];
    for (const informe of informes) {
      if (informe.error !== undefined) { fallidos.push(informe); continue; }
      imprimeInforme(informe);
      for (const cuenta of Object.values(informe.contadores)) { insertadas += cuenta.insertadas; actualizadas += cuenta.actualizadas; }
      rechazadas += informe.rechazadas.length;
      if (informe.validacion.ok) correctos += 1;
    }
    console.log(`\nRESUMEN: ${informes.length - fallidos.length} grupo(s) · ${insertadas} filas insertadas · ${actualizadas} actualizadas · `
      + `${rechazadas} rechazadas · validación correcta en ${correctos}/${informes.length - fallidos.length}${opciones.seco ? ' · MODO SECO (nada escrito)' : ''}`);
    if (fallidos.length > 0) {
      /*
       * Los que no entraron salen SIEMPRE y al final, cada uno con su motivo. Con `--continuar` la
       * importación sigue, pero un grupo que no ha entrado es cobertura que falta: esconderlo sería
       * exactamente el tipo de silencio que este proyecto no se permite.
       */
      console.log(`\nGRUPOS QUE NO HAN ENTRADO (${fallidos.length}):`);
      for (const f of fallidos) {
        console.log(`  ✗ t${f.etiquetaTemporada} c${f.competicion} g${f.grupo}: ${f.error}`);
      }
      if (!opciones.continuar) process.exit(1);
    }
    if (opciones.continuar ? correctos === 0 : correctos !== informes.length) process.exit(1);
  } finally {
    await pool.end();
  }
}

principal().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error);
  console.error(`✗ ${mensaje}`);
  if (error instanceof Error && error.stack && process.env.FACYLF_DEBUG) console.error(error.stack);
  process.exit(1);
});
