/*
 * RELLENA EL ESTADO DE LA TABLA OFICIAL de cada grupo en la cobertura, sin reimportar nada.
 *
 * Por qué. La migración 0019 añade `ops.coverage_checkpoint.tabla_oficial_estado` para que quien consulta
 * pueda distinguir «la federación no la ha publicado» de «se archivó y no se pudo leer» —el motivo del
 * descarte va a `ops.normalizacion_error`, que el rol de lectura NO ve—. El importador lo escribe al
 * importar, pero los grupos ya importados se quedarían en «sin calcular» durante semanas.
 *
 * Qué escribe, y de dónde sale cada valor. Los estados los decide `diagnosticaTablaOficial`, en el paquete
 * canónico: **el mismo lector y las mismas reglas que el importador**, no una copia. La migración 0020 añadió
 * tres estados más porque los tres primeros no explicaban todo (v. `clasificacion-oficial.ts`):
 *
 *   'importada'    · el canónico YA tiene la tabla oficial de ese grupo.
 *   'rechazada'    · hay clasificación archivada y su validador la descarta (la federación la publica mal).
 *   'sin_archivar' · no hay clasificación archivada.
 *   'sin_filas'    · hay archivo y no trae filas de clasificación.
 *   'ilegible'     · hay archivo, trae TABLA, y el lector de hoy no saca ni una fila: hueco NUESTRO.
 *   null           · hay archivo legible y el canónico NO tiene la tabla: el grupo se importó antes de que se
 *                    archivara. No se inventa una etiqueta para eso: lo que hay que hacer es volver a
 *                    importar el grupo, y así queda dicho.
 *
 * Uso: node --import tsx scripts/revisa-tabla-oficial.mts [--aplicar]
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnosticaTablaOficial, mtimeDelArchivo } from '../packages/canonico/src/clasificacion-oficial.js';
import { ColaOrigen } from '../packages/canonico/src/origen/cola.ts';
import { creaPool } from '../packages/canonico/src/destino/pool.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const aplicar = process.argv.includes('--aplicar');
// Las credenciales viven en `.env` (nunca versionado) y hay que cargarlas ANTES de crear el pool.
if (existsSync(join(RAIZ, '.env'))) process.loadEnvFile(join(RAIZ, '.env'));
// `node:sqlite` se carga por `createRequire` porque el transformador de módulos no lo resuelve (v. el
// paquete canónico): es el mismo camino que usa el importador.
const { DatabaseSync } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('node:sqlite') as typeof import('node:sqlite');

const pool = creaPool();
const { rows: conTabla } = await pool.query<{ federacion: string; etiqueta: string; grupo: string; oficiales: number; phase_group_id: string; estado_guardado: string | null }>(`
  select f.codigo as federacion, s.etiqueta, pg.codigo_externo as grupo, pg.id as phase_group_id,
         (select count(*)::int from core.standing_snapshot ss where ss.phase_group_id = pg.id and ss.origen = 'oficial') as oficiales,
         (select cc.tabla_oficial_estado from ops.coverage_checkpoint cc where cc.phase_group_id = pg.id) as estado_guardado
    from core.phase_group pg
    join core.competition_edition ce on ce.id = pg.competition_edition_id
    join core.federation f on f.id = ce.federation_id
    join core.season s on s.id = ce.season_id
   where pg.codigo_externo is not null`);

/*
 * La temporada del canónico se llama «2025-26» y la cola la numera («21»), así que el código se saca de la
 * propia cola: es la única que sabe la correspondencia, y ya está en su tabla `temporadas`.
 */
const porFederacion = new Map<string, typeof conTabla>();
for (const fila of conTabla) {
  const suyos = porFederacion.get(fila.federacion) ?? [];
  suyos.push(fila);
  porFederacion.set(fila.federacion, suyos);
}

const cuenta = new Map<string, number>();
const pendientes: Array<{ phaseGroupId: string; estado: string; archivoEn: Date | null }> = [];
/** Grupos cuyo archivo HOY se lee y el canónico no tiene: se les borra la fecha para que el plan los mire. */
const porMirar: string[] = [];
for (const [federacion, filas] of porFederacion) {
  /*
   * Las federaciones de PRUEBA del entorno (las que crean las pruebas del canónico) no tienen cola en el
   * repositorio: no son federaciones reales y no se tocan.
   */
  const rutaCola = ColaOrigen.rutaDeFederacion(RAIZ, federacion);
  if (!existsSync(rutaCola)) {
    cuenta.set('sin_cola', (cuenta.get('sin_cola') ?? 0) + filas.length);
    continue;
  }
  const cola = new ColaOrigen(rutaCola);
  const codigoDeTemporada = new Map(cola.temporadas().map((t) => [t.etiqueta, t.codigo]));
  const db = new DatabaseSync(cola.ruta, { readOnly: true, timeout: 10_000 });
  const raizCola = dirname(cola.ruta);
  for (const fila of filas) {
    let estado: string;
    let archivoEn: Date | null = null;
    if (fila.oficiales > 0) {
      estado = 'importada';
    } else {
      const codigo = codigoDeTemporada.get(fila.etiqueta);
      const competicion = codigo === undefined
        ? undefined
        : db.prepare('select competicion from grupos where temporada = ? and codigo = ?').get(codigo, fila.grupo) as { competicion: string } | undefined;
      if (codigo === undefined || competicion === undefined) {
        estado = 'sin_archivar';
      } else {
        /*
         * El diagnóstico dice uno de cinco estados mirando el archivo. «legible» significa que el archivo
         * trae filas y el canónico NO las tiene: eso es trabajo pendiente de importación, así que se deja en
         * «sin calcular» a propósito —no se inventa una etiqueta para «hay que reimportar»—, y por eso NO se
         * escribe la fecha del archivo: el plan del importador tiene que seguir viendo ese grupo como
         * pendiente (v. migración 0021).
         */
        const datos = {
          raizCola, temporada: { codigo, etiqueta: fila.etiqueta }, competicion: competicion.competicion, grupo: fila.grupo,
        };
        const { estado: delArchivo } = diagnosticaTablaOficial(datos);
        /*
         * ── «LEGIBLE» NO SIEMPRE QUIERE DECIR «PENDIENTE DE IMPORTAR» (medido el 25/09/2026) ─────────────
         *
         * Hay tablas que el archivo trae bien y el importador NO puede escribir, por motivos que sólo se ven
         * al importar: los equipos publicados no se resuelven dentro de su propio grupo, dos filas apuntan al
         * mismo equipo, o el canónico no tiene ninguna jornada completa a la que colgar la foto. El lote ya
         * dejó su veredicto (`rechazada`, `sin_corte`). Este diagnóstico, que sólo mira el archivo, no puede
         * saberlo, así que **se respeta el veredicto del lote** y lo único que se añade es CON QUÉ archivo se
         * decidió: eso es lo que impide que el plan vuelva a pedir los mismos 1.394 grupos en cada pasada
         * (migración 0021).
         *
         * Y si el grupo nunca se ha importado con esa clasificación archivada, no se escribe nada: sigue
         * pendiente, que es lo que el plan tiene que ver.
         */
        const veredictoDelLote = fila.estado_guardado;
        const esVeredicto = ['rechazada', 'sin_corte', 'ilegible', 'sin_filas'].includes(veredictoDelLote);
        if (delArchivo === 'legible') {
          if (esVeredicto) {
            estado = veredictoDelLote;
            archivoEn = mtimeDelArchivo(datos);
          } else {
            estado = 'sin_calcular';
          }
        } else {
          estado = delArchivo;
          archivoEn = mtimeDelArchivo(datos);
        }
        /*
         * ── Y CUANDO EL LECTOR CAMBIA, EL VEREDICTO VIEJO NO VALE (medido el 25/09/2026) ─────────────────
         *
         * Un veredicto —«no la sé leer»— lo dio un LECTOR, y el lector cambia: el 25/09/2026 se le enseñó a
         * leer las cabeceras en euskera y en baleares y las tablas con una columna de más, y 1.382
         * clasificaciones que estaban en `ilegible` pasaron a leerse. Si el veredicto se guardara con su
         * fecha, el plan no volvería a mirarlas nunca.
         *
         * Así que cuando el archivo HOY se lee y el canónico no tiene la tabla, se borra la fecha del
         * archivo (no el veredicto, que sigue diciendo lo que dijo): así el plan vuelve a mirar el grupo, y
         * el importador decide otra vez con el lector de hoy. Si vuelve a no poder, escribirá su veredicto
         * con la fecha nueva y el grupo se queda quieto hasta que algo cambie de verdad.
         */
        if (delArchivo === 'legible' && esVeredicto) porMirar.push(fila.phase_group_id);
      }
    }
    cuenta.set(estado, (cuenta.get(estado) ?? 0) + 1);
    if (estado !== 'sin_calcular') pendientes.push({ phaseGroupId: fila.phase_group_id, estado, archivoEn });
  }
  db.close();
  cola.cierra();
}

console.log('estado de la tabla oficial, grupo a grupo:');
for (const [estado, n] of [...cuenta].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(6)} · ${estado}`);
console.log(`   (los «sin_calcular» tienen archivo legible y tabla sin importar: hay que reimportar el grupo)`);

if (!aplicar) {
  console.log('\n  (simulación: no se ha escrito nada; añade --aplicar para hacerlo)');
  await pool.end();
  process.exit(0);
}
for (const p of pendientes) {
  await pool.query(
    'update ops.coverage_checkpoint set tabla_oficial_estado = $2, tabla_oficial_archivo_en = $3 where phase_group_id = $1',
    [p.phaseGroupId, p.estado, p.archivoEn],
  );
}
for (const phaseGroupId of porMirar) {
  await pool.query('update ops.coverage_checkpoint set tabla_oficial_archivo_en = null where phase_group_id = $1', [phaseGroupId]);
}
console.log(`\n  ${pendientes.length} grupo(s) anotados en la cobertura`);
if (porMirar.length > 0) {
  console.log(`  ${porMirar.length} grupo(s) con veredicto viejo y archivo que HOY se lee: se les ha quitado la fecha`
    + ' para que el plan del importador los vuelva a mirar con el lector de hoy');
}
await pool.end();
if (!existsSync(RAIZ)) console.log('');
