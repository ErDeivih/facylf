#!/usr/bin/env node
/*
 * ¿POR QUÉ SE RECHAZA CADA TABLA OFICIAL? El reparto por motivo, que decide si el resolutor por código sirve.
 *
 * Por qué. `ops.coverage_checkpoint.tabla_oficial_estado` dice que 1.894 grupos tienen su tabla oficial
 * archivada y RECHAZADA, pero no distingue los motivos, y el motivo cambia el arreglo: una tabla que el
 * validador descarta por posiciones con huecos no la arregla nadie desde aquí (la publica mal la federación),
 * y una tabla que se descarta porque sus equipos no están en el catálogo del grupo SÍ —resolviéndolos por el
 * código que la propia tabla publica—.
 *
 * El motivo quedó escrito al importar, en `ops.normalizacion_error`, que el rol de LECTURA no ve. Así que esta
 * herramienta lee con `DATABASE_URL_MIGRACION` (el dueño) y SÓLO hace `select`: no escribe ni una fila.
 *
 * Uso: node scripts/mide-motivos-tabla-oficial.mjs [--json]
 */
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'motivos-tabla-oficial.json');
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { Client } = requerir('pg');

const soloJson = process.argv.includes('--json');
if (existsSync(join(RAIZ, '.env'))) process.loadEnvFile(join(RAIZ, '.env'));
const url = (process.env.DATABASE_URL_MIGRACION ?? '').trim();
if (url === '') {
  console.error('Sin DATABASE_URL_MIGRACION no se puede leer `ops.normalizacion_error` (el rol de lectura no lo ve).');
  process.exit(1);
}

const cliente = new Client({ connectionString: url, statement_timeout: 600_000 });
await cliente.connect();
const parte = { cuando: new Date().toISOString() };
try {
  // 1. Cuántos avisos hay de cada código de la tabla oficial.
  const { rows: porCodigo } = await cliente.query(
    `select codigo, count(*)::int as n
       from ops.normalizacion_error
      where codigo like 'clasificacion_oficial%'
      group by 1 order by n desc`);
  parte.porCodigo = porCodigo;

  // 2. Y el motivo literal con el que se rechazó cada grupo (lo escribe el importador al capturar la excepción).
  const { rows: porMotivo } = await cliente.query(
    `select codigo,
            parametros->>'motivo' as motivo,
            count(distinct parametros->>'grupo')::int as grupos,
            count(*)::int as avisos
       from ops.normalizacion_error
      where codigo like 'clasificacion_oficial%'
      group by 1, 2 order by avisos desc`);
  parte.porMotivo = porMotivo;

  // 3. El estado guardado en la cobertura, que es lo que consulta quien mira la web.
  const { rows: porEstado } = await cliente.query(
    `select coalesce(tabla_oficial_estado, '(sin calcular)') as estado, count(*)::int as n
       from ops.coverage_checkpoint group by 1 order by n desc`);
  parte.porEstado = porEstado;

  /*
   * 4. Y lo que de verdad decide el arreglo: de los grupos rechazados porque sus equipos no se resuelven,
   *    cuántas filas quedaron sin resolver. Es el techo de lo que desbloquearía resolver por el código que
   *    publica la propia tabla. Los avisos traen `detalle` con el recuento y los nombres.
   */
  const { rows: sinResolver } = await cliente.query(
    `select parametros->>'federacion' as federacion,
            count(*)::int as avisos
       from ops.normalizacion_error
      where codigo = 'clasificacion_oficial_ilegible'
        and parametros->>'motivo' like '%no se pueden resolver%'
      group by 1 order by avisos desc`);
  parte.gruposConEquiposSinResolver = sinResolver;

  const { rows: ejemplo } = await cliente.query(
    `select parametros as p from ops.normalizacion_error
      where codigo = 'clasificacion_oficial_ilegible'
        and parametros->>'motivo' like '%no se pueden resolver%'
      order by id desc limit 3`);
  parte.ejemplos = ejemplo.map((f) => f.p);

  /*
   * 5. Y LA PRUEBA DE QUE EL RESOLUTOR POR CÓDIGO TRABAJA DE VERDAD: cuántas tablas oficiales se han escrito
   *    resolviendo alguna fila por el código que publicaba la propia tabla. El contador existe desde el
   *    26/09/2026 (`resueltas_por_codigo_publicado` en el aviso de importación), así que los avisos anteriores
   *    no lo traen y se cuentan aparte.
   */
  const { rows: porCodigoPublicado } = await cliente.query(
    `select
        count(*) filter (where (parametros->>'resueltas_por_codigo_publicado')::int > 0)::int as importaciones_que_lo_usaron,
        count(distinct parametros->>'grupo') filter (where (parametros->>'resueltas_por_codigo_publicado')::int > 0)::int as grupos,
        coalesce(sum((parametros->>'resueltas_por_codigo_publicado')::int), 0)::int as filas_por_codigo,
        count(*)::int as importaciones_desde_que_existe,
        coalesce(sum((parametros->>'filas_de_descanso')::int), 0)::int as filas_de_descanso
       from ops.normalizacion_error
      where codigo = 'clasificacion_oficial_importada'
        and parametros ? 'resueltas_por_codigo_publicado'`);
  parte.resolutorPorCodigoPublicado = porCodigoPublicado[0];
  /*
   * 6. Y cómo van las tablas escritas según la jornada de corte (migración 0022, decisión del 27/09/2026): una
   *    tabla anclada a una jornada INCOMPLETA es una foto real pero de fecha no confirmada, y eso se declara.
   *    Este reparto es la medida directa de lo que desbloqueó la política de `sin_corte`.
   */
  const { rows: porCorte } = await cliente.query(
    `select coalesce(tabla_oficial_corte_completo::text, '(sin tabla)') as corte, count(*)::int as n
       from ops.coverage_checkpoint group by 1 order by n desc`);
  parte.porCorte = porCorte;
} finally {
  await cliente.end();
}
writeFileSync(SALIDA, `${JSON.stringify(parte, null, 2)}\n`);

if (soloJson) {
  console.log(JSON.stringify(parte, null, 2));
  process.exit(0);
}

console.log(`═══ por qué se rechaza cada tabla oficial · ${new Date().toLocaleString('es-ES')}`);
console.log('');
console.log('avisos por código:');
for (const f of parte.porCodigo) console.log(`  ${String(f.n).padStart(7)}  ${f.codigo}`);
console.log('');
console.log('motivo literal (los que más grupos afectan):');
for (const f of parte.porMotivo.filter((m) => m.motivo !== null).slice(0, 12)) {
  console.log(`  ${String(f.grupos).padStart(5)} grupo(s)  ${String(f.avisos).padStart(6)} aviso(s)  ${String(f.motivo).slice(0, 110)}`);
}
console.log('');
console.log('estado en la cobertura:');
for (const f of parte.porEstado) console.log(`  ${String(f.n).padStart(7)}  ${f.estado}`);
if (parte.gruposConEquiposSinResolver.length > 0) {
  console.log('');
  console.log('grupos rechazados por EQUIPOS QUE NO SE RESUELVEN (avisos históricos, no el estado de hoy):');
  for (const f of parte.gruposConEquiposSinResolver) console.log(`  ${String(f.avisos).padStart(5)}  ${f.federacion}`);
}
const r = parte.resolutorPorCodigoPublicado;
console.log('');
console.log('RESOLUTOR POR EL CÓDIGO QUE PUBLICA LA TABLA (v. §4.2):');
console.log(`  ${r.importaciones_que_lo_usaron} importación(es) lo USARON (de ${r.importaciones_desde_que_existe} desde que existe el contador) · ${r.grupos} grupo(s)`);
console.log(`  ${r.filas_por_codigo} fila(s) resueltas por código · ${r.filas_de_descanso} fila(s) de descanso apartadas`);
console.log('');
console.log('JORNADA DE CORTE DE LAS TABLAS ESCRITAS (migración 0022):');
for (const f of parte.porCorte) {
  const etiqueta = f.corte === 'true' ? 'corte sobre jornada COMPLETA (foto verificada)'
    : f.corte === 'false' ? 'anclada a la última jornada, SIN confirmar (sin_corte, opción A)'
      : 'sin tabla escrita';
  console.log(`  ${String(f.n).padStart(6)}  ${etiqueta}`);
}
console.log(`\n  el detalle: ${SALIDA.replace(`${RAIZ}\\`, '')}`);
