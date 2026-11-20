import Link from 'next/link';
import type { Metadata, Route } from 'next';

import { CALIDAD_GLOBAL, EQUIPOS_DE_LA_TEMPORADA, type FilaCalidadGlobal, type FilaEquiposDeGrupo } from '@/consultas/calidad';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { plural } from '@/lib/plural';
import { FilaCalidad } from '@/componentes/calidad/FilaCalidad';
import {
  Badge, Button, Card, CardContent, Input, Label, EstadoVacio, Progress, Select, Table, TableBody,
  TableCell, TableHead, TableHeader, TableRow,
} from '@/componentes/ui';

export const metadata: Metadata = {
  title: 'Calidad de los grupos — Fondo Popular',
  description: 'Reglas de coherencia por grupo (PJ, puntos, goles), cobertura de actas y contador de incoherencias.',
};

export const revalidate = 120;

const RUTA = '/explorar/calidad';
/** Grupos por página: con 249 filas, pintarlas todas multiplica por dos el DOM y no se recorre. */
const POR_PAGINA = 30;

type Parametros = Record<string, string | string[] | undefined>;
type Orden = 'nombre' | 'incidencias' | 'actas';

const ORDENES: Array<{ valor: Orden; etiqueta: string }> = [
  { valor: 'nombre', etiqueta: 'Nombre (A-Z)' },
  { valor: 'incidencias', etiqueta: 'Primero las incidencias' },
  { valor: 'actas', etiqueta: 'Menos actas primero' },
];

/** El estado del filtro vive en la URL (`q`, `solo`, `orden` y `pagina`): la vista se comparte igual. */
function leerFiltro(parametros: Parametros): { texto: string; soloKo: boolean; pagina: number; orden: Orden } {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const pagina = Number(uno(parametros.pagina));
  const orden = uno(parametros.orden) as Orden;
  return {
    texto: uno(parametros.q).trim().slice(0, 80),
    soloKo: uno(parametros.solo) === 'ko',
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
    orden: ORDENES.some((o) => o.valor === orden) ? orden : 'nombre',
  };
}

/** URL del panel conservando filtro, orden y (opcionalmente) página. */
function urlDelPanel(filtro: { texto: string; soloKo: boolean; orden: Orden }, pagina = 1): string {
  const params = new URLSearchParams();
  if (filtro.texto) params.set('q', filtro.texto);
  if (filtro.soloKo) params.set('solo', 'ko');
  if (filtro.orden !== 'nombre') params.set('orden', filtro.orden);
  if (pagina > 1) params.set('pagina', String(pagina));
  const qs = params.toString();
  return qs ? `${RUTA}?${qs}` : RUTA;
}

/**
 * Panel de calidad global: todos los grupos de la temporada con las tres reglas y el % de actas.
 *
 * El contador de KO se calcula CON LAS MISMAS FILAS que se pintan (no con otra consulta), así que no
 * puede contradecir a la columna: si una fila dice KO, cuenta; si dice OK, no cuenta.
 *
 * Revisión externa del 13/11/2026 aplicada sin cambiar los datos ni la lógica de coherencia:
 *  · buscador por equipo, grupo o competición (los equipos se leen aparte sólo si hay texto) y
 *    ordenación explícita;
 *  · paginación con contador visible (30 por página) para no recorrer cientos de filas;
 *  · en móvil cada grupo es un bloque con nombre legible y una métrica principal, y los indicadores
 *    quedan al desplegar; la tabla con cabecera fija y la primera columna fija se conserva en escritorio;
 *  · una explicación accesible de qué significa «calidad» (las tres reglas y qué implica cada estado).
 * La estructura de columnas y las métricas son las mismas: sólo cambia cómo se presentan.
 */
export default async function PantallaCalidad({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const filtro = leerFiltro(parametros);
  const temporada = '2026-27';

  let filas: FilaCalidadGlobal[] = [];
  let equiposPorGrupo = new Map<number, string>();
  try {
    filas = await consulta<FilaCalidadGlobal>(CALIDAD_GLOBAL.sql, [temporada], {
      presupuestoMs: CALIDAD_GLOBAL.presupuestoMs,
    });
    // Buscar por equipo es una lectura de apoyo: sólo se pide cuando hay texto y hay algo que buscar.
    if (filtro.texto.length >= 2) {
      const equipos = await consulta<FilaEquiposDeGrupo>(EQUIPOS_DE_LA_TEMPORADA.sql, [temporada], {
        presupuestoMs: EQUIPOS_DE_LA_TEMPORADA.presupuestoMs,
      });
      equiposPorGrupo = new Map(equipos.map((e) => [Number(e.grupo_id), e.equipos ?? '']));
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return (
        <div className="flex flex-col gap-4">
          <Migas />
          <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Calidad de los grupos</h1>
          <EstadoVacio
            titulo="Los datos no están disponibles ahora mismo"
            descripcion="La consulta de calidad no ha podido completarse. No se muestra una tabla vacía como si no hubiera incidencias."
            accion={<Button asChild variant="secondary"><Link href={RUTA as Route}>Reintentar</Link></Button>}
          />
        </div>
      );
    }
    throw error;
  }

  const ko = filas.filter((f) => f.resultado === 'KO').length;
  const ok = filas.length - ko;
  const total = filas[0]?.total_grupos ?? filas.length;
  const koSql = filas[0]?.total_ko ?? ko;
  const porcentajeMedio = filas.length
    ? Math.round(filas.reduce((a, f) => a + Number(f.porcentaje_actas), 0) / filas.length)
    : 0;

  const consultaTexto = filtro.texto.toLocaleLowerCase('es');
  const visibles = filas.filter((f) => {
    if (filtro.soloKo && f.resultado !== 'KO') return false;
    if (!consultaTexto) return true;
    const nombre = `${f.edicion} · ${f.grupo} · ${f.federacion}`.toLocaleLowerCase('es');
    if (nombre.includes(consultaTexto)) return true;
    // Equipo: «Ribert» encuentra «Primera - Salamanca» aunque el grupo no lo diga.
    return (equiposPorGrupo.get(Number(f.grupo_id)) ?? '').toLocaleLowerCase('es').includes(consultaTexto);
  });

  const porNombre = (a: FilaCalidadGlobal, b: FilaCalidadGlobal) =>
    `${a.edicion} · ${a.grupo}`.localeCompare(`${b.edicion} · ${b.grupo}`, 'es');
  const ordenadas = [...visibles].sort((a, b) => {
    if (filtro.orden === 'incidencias') {
      const diferencia = Number(b.resultado === 'KO') - Number(a.resultado === 'KO');
      return diferencia !== 0 ? diferencia : porNombre(a, b);
    }
    if (filtro.orden === 'actas') {
      return Number(a.porcentaje_actas) - Number(b.porcentaje_actas) || porNombre(a, b);
    }
    return porNombre(a, b);
  });

  const hayFiltro = filtro.texto.length > 0 || filtro.soloKo;
  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
  const pagina = Math.min(filtro.pagina, totalPaginas);
  const desde = (pagina - 1) * POR_PAGINA;
  const hasta = Math.min(desde + POR_PAGINA, ordenadas.length);
  const enPagina = ordenadas.slice(desde, desde + POR_PAGINA);
  const ordenEtiqueta = ORDENES.find((o) => o.valor === filtro.orden)?.etiqueta ?? '';

  return (
    <div className="flex flex-col gap-4">
      <Migas />

      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Calidad de los grupos</h1>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          Temporada {temporada}. Las tres reglas se calculan sobre los mismos partidos que pinta esta lista.
        </p>
      </header>

      <section aria-label="Resumen de calidad" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TarjetaCifra etiqueta="Grupos" valor={String(filas.length)} nota={`de ${total}`} dato="total-grupos" />
        <TarjetaCifra etiqueta="Sin incidencias" valor={String(ok)} nota="filas que cuadran" />
        <TarjetaCifra
          etiqueta="Incidencias"
          valor={String(ko)}
          nota={ko === 0 ? 'sin descuadres' : koSql === ko ? 'coincide con la tabla' : `la columna dice ${koSql}`}
          dato="total-ko"
          tono={ko > 0 ? 'ko' : 'ok'}
        />
        <TarjetaCifra etiqueta="Actas medias" valor={`${porcentajeMedio} %`} nota="de los partidos con resultado" />
      </section>

      <Card>
        <CardContent className="py-3">
          <form action={RUTA} method="get" aria-label="Buscar y ordenar la calidad" className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label htmlFor="calidad-q">Buscar por equipo, grupo o competición</Label>
                <Input id="calidad-q" type="search" name="q" defaultValue={filtro.texto}
                  placeholder="Ribert, Primera · Salamanca…" />
              </div>
              <div className="flex flex-col gap-1 sm:w-56">
                <Label htmlFor="calidad-orden">Ordenar por</Label>
                <Select id="calidad-orden" name="orden" defaultValue={filtro.orden}>
                  {ORDENES.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </Select>
              </div>
              {filtro.soloKo && <input type="hidden" name="solo" value="ko" />}
              <Button type="submit">Buscar</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant={filtro.soloKo ? 'default' : 'secondary'}>
                <Link href={urlDelPanel({ ...filtro, soloKo: !filtro.soloKo }) as Route}>
                  {filtro.soloKo ? 'Viendo solo incidencias' : 'Solo incidencias'}
                </Link>
              </Button>
              {hayFiltro && (
                <Button asChild variant="enlace"><Link href={RUTA as Route}>Quitar filtros</Link></Button>
              )}
              <span className="text-nota text-[var(--texto-suave)]">Ordenado por: {ordenEtiqueta.toLowerCase()}</span>
            </div>
          </form>
        </CardContent>
      </Card>

      <details id="calidad-explicacion" className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-tabla font-semibold text-[var(--texto)] [&::-webkit-details-marker]:hidden">
          Qué significa «calidad» aquí
        </summary>
        <div className="pb-2 text-tabla leading-relaxed text-[var(--texto-suave)]">
          <p className="m-0">
            Cada fila es un <strong className="text-[var(--texto)]">grupo</strong> (una competición en una
            provincia y categoría). Se comprueban tres cosas sobre sus partidos con resultado:
            <strong className="text-[var(--texto)]"> PJ = V+E+D</strong> (partidos jugados),
            <strong className="text-[var(--texto)]"> Puntos = 3V+E</strong> y
            <strong className="text-[var(--texto)]"> ΣGF = ΣGC</strong> (goles a favor = goles en contra).
          </p>
          <p className="m-0 mt-2">
            Un grupo <strong className="text-[var(--texto)]">cuadra</strong> si las tres dan cero. Si alguna
            no, se muestra <strong className="text-[var(--texto)]">no cuadra</strong> con el descuadre exacto:
            esa tabla no se publica como definitiva y una persona tiene que revisarla. «Actas» es cuántos
            partidos con resultado tienen acta enlazada.
          </p>
        </div>
      </details>

      <p aria-live="polite" className="m-0 text-nota text-[var(--texto-suave)]">
        {ordenadas.length === 0 ? 'Ningún grupo encaja con la búsqueda' : (
          <>
            Mostrando <strong className="tabular-nums text-[var(--texto)]">{desde + 1}–{hasta}</strong> de{' '}
            <strong className="tabular-nums text-[var(--texto)]">{ordenadas.length}</strong>{' '}
            {plural(ordenadas.length, 'grupo', 'grupos')}
            {hayFiltro ? ' con los filtros aplicados' : ''} · página {pagina} de {totalPaginas}
          </>
        )}
      </p>

      {ordenadas.length === 0 ? (
        <EstadoVacio
          titulo={hayFiltro ? 'Ningún grupo encaja con esa búsqueda' : 'Todavía no hay grupos con resultados en esta temporada'}
          descripcion={hayFiltro
            ? 'Prueba con el nombre del equipo, del grupo o de la competición, o quita los filtros.'
            : 'Cuando la temporada tenga partidos con resultado, aparecerán aquí.'}
          accion={hayFiltro ? <Button asChild variant="secondary"><Link href={RUTA as Route}>Quitar los filtros</Link></Button> : undefined}
        />
      ) : (
        <>
          {/* Móvil: un bloque por grupo, con nombre legible y una métrica principal; el resto al desplegar. */}
          <Card className="overflow-hidden md:hidden">
            {enPagina.map((f) => <FilaCalidad key={f.grupo_id} fila={f} />)}
          </Card>

          {/* Escritorio: la tabla de siempre, con cabecera fija y primera columna fija. */}
          <div className="hidden md:block">
            <Table
              aria-label={`Calidad de ${ordenadas.length} grupos de la temporada ${temporada}`}
              aria-describedby="calidad-explicacion"
              classNameContenedor="overflow-x-auto"
              etiquetaDesplazamiento="Calidad por grupo: desplázate en horizontal para ver todas las reglas"
            >
              <TableHeader>
                <TableRow>
                  <TableHead pegajosa fija aria-sort={filtro.orden === 'nombre' ? 'ascending' : 'none'} className="pl-4 pr-1.5">Competición · grupo</TableHead>
                  <TableHead pegajosa className="text-right">PJ</TableHead>
                  <TableHead pegajosa className="text-right">Puntos</TableHead>
                  <TableHead pegajosa className="text-right">ΣGF</TableHead>
                  <TableHead pegajosa aria-sort={filtro.orden === 'actas' ? 'ascending' : 'none'} className="text-right">Actas</TableHead>
                  <TableHead pegajosa aria-sort={filtro.orden === 'incidencias' ? 'ascending' : 'none'} className="pr-4 text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enPagina.map((f) => (
                  <TableRow key={f.grupo_id} data-estado={f.resultado === 'KO' ? 'ko' : undefined}>
                    <TableCell fija className="whitespace-normal py-3 pl-4 pr-1.5">
                      <Link href={`/explorar/competicion/${f.grupo_id}` as Route}
                        className="inline-flex min-h-11 items-center text-cuerpo font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
                        {f.edicion}
                      </Link>
                      <span className="block text-nota text-[var(--texto-suave)]">{f.grupo}</span>
                    </TableCell>
                    <TableCell className="text-right align-middle tabular-nums"><Regla valor={Number(f.descuadre_pj)} detalle="PJ = V+E+D" /></TableCell>
                    <TableCell className="text-right align-middle tabular-nums"><Regla valor={Number(f.descuadre_puntos)} detalle="Puntos = 3V+E" /></TableCell>
                    <TableCell className="text-right align-middle tabular-nums"><Regla valor={Number(f.descuadre_goles)} detalle="ΣGF = ΣGC" /></TableCell>
                    <TableCell className="min-w-[7.5rem] text-right align-middle tabular-nums">
                      <span className="block text-tabla text-[var(--texto)]">{f.porcentaje_actas} %</span>
                      <span className="block text-nota text-[var(--texto-suave)]">{f.con_acta}/{f.con_resultado}</span>
                      <Progress valor={Number(f.porcentaje_actas)} etiqueta={`Actas de ${f.edicion} · ${f.grupo}`} className="mt-1" />
                    </TableCell>
                    <TableCell className="pr-4 text-right align-middle">
                      <Badge variant={f.resultado === 'KO' ? 'ko' : 'ok'}>{f.resultado === 'KO' ? 'No cuadra' : 'Cuadra'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <nav aria-label="Paginación de calidad" className="flex flex-wrap items-center justify-between gap-3 text-nota text-[var(--texto-suave)]">
            <span>
              {ordenadas.length} {plural(ordenadas.length, 'grupo', 'grupos')} · {desde + 1}–{hasta}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {pagina > 1 && (
                <Button asChild variant="secondary">
                  <Link href={urlDelPanel(filtro, pagina - 1) as Route}>← Anterior</Link>
                </Button>
              )}
              <span>Página {pagina} de {totalPaginas}</span>
              {pagina < totalPaginas && (
                <Button asChild variant="secondary">
                  <Link href={urlDelPanel(filtro, pagina + 1) as Route}>Siguiente →</Link>
                </Button>
              )}
            </span>
          </nav>
        </>
      )}
    </div>
  );
}

function Migas() {
  return (
    <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
      <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
      <span aria-hidden="true">›</span>
      <span className="text-[var(--texto)]" aria-current="page">Calidad de los grupos</span>
    </nav>
  );
}

/** Una regla de coherencia: «Cuadra» cuando el descuadre es 0, y si no el descuadre exacto. */
function Regla({ valor, detalle }: { valor: number; detalle: string }) {
  if (valor === 0) return <Badge variant="ok">Cuadra</Badge>;
  return (
    <Badge variant="ko" title={detalle}>
      No cuadra ({valor > 0 ? '+' : ''}{valor})
    </Badge>
  );
}

/** Cifra de resumen con su etiqueta; `dato` conserva los ganchos que usa el QA. */
function TarjetaCifra({ etiqueta, valor, nota, dato, tono }: {
  etiqueta: string;
  valor: string;
  nota: string;
  dato?: 'total-grupos' | 'total-ko';
  tono?: 'ok' | 'ko';
}) {
  return (
    <Card className="px-3 py-2.5">
      <p className="m-0 text-etiqueta text-[var(--texto-suave)]">{etiqueta}</p>
      <p className="m-0 mt-0.5 text-dato font-bold tabular-nums text-[var(--texto)]">
        {dato === 'total-ko'
          ? <strong data-total-ko>{valor}</strong>
          : dato === 'total-grupos'
            ? <strong data-total-grupos>{valor}</strong>
            : <strong>{valor}</strong>}
      </p>
      <p className="m-0 text-nota text-[var(--texto-suave)]">
        {tono === 'ko' ? <Badge variant="ko">{nota}</Badge> : tono === 'ok' ? <Badge variant="ok">{nota}</Badge> : nota}
      </p>
    </Card>
  );
}
