import Link from 'next/link';
import type { Route } from 'next';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Chip, TablaDatos, Vacio } from '@/componentes/base';
import type { ColumnaTabla } from '@/componentes/base';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { FEDERACIONES_DEL_CANONICO, FACETAS_DEL_CATALOGO, PARAMETROS_CATALOGO } from '@/consultas/catalogo';
import type { FilaFederacionCanonica, FilaFaceta } from '@/consultas/catalogo';
import { BUSQUEDA_POR_NOMBRE } from '@/consultas/entidades';
import type { FilaBusqueda } from '@/consultas/entidades';
import { agrupaFacetas, numero, texto } from '@/lib/presentacion-canonico';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, ETIQUETA_FILTRO } from '@/componentes/ui/legado';

export const dynamic = 'force-dynamic';

/**
 * Búsqueda por nombre en el canónico: **clubes y jugadores**.
 *
 * Antes esta página recorría las dieciocho colas SQLite con `lib/busqueda`. Se sustituye porque leer
 * archivos federativos dentro de una petición de usuario es lo que prohíbe ARQUITECTURA.md §7, y
 * porque la búsqueda global contra las dieciocho colas tardaba **77,7 s** medidos. Ahora es una
 * consulta sobre `core`, con índice de trigramas, y el contrato de la página no cambia: mismo `q`,
 * mismo estilo de facetas, y el estado principal en la URL.
 *
 * Tres decisiones que se ven en pantalla:
 *
 * 1. **Se busca sin tildes ni signos**, así que `penaranda` encuentra `Peñaranda`; pero **se enseña el
 *    literal original** de la fuente, que es el nombre real y no la clave de búsqueda.
 * 2. **Un club y una persona son resultados distintos y no se mezclan**: cada uno lleva su tipo y su
 *    enlace, y una persona nunca se presenta como miembro de un club por coincidencia de nombre. Su
 *    contexto sale de sus actas.
 * 3. **La identidad nominal se marca.** Si a una persona se le asignó identidad sin código federativo,
 *    el resultado lo dice: un nombre igual no une a dos personas.
 */

const TIPOS: Array<{ valor: string; etiqueta: string }> = [
  { valor: '', etiqueta: 'Todo' },
  { valor: 'club', etiqueta: 'Clubes' },
  { valor: 'jugador', etiqueta: 'Jugadores' },
];

export default async function Buscar({ searchParams }: {
  searchParams: Promise<{ q?: string; tipo?: string; fed?: string; temp?: string }>;
}) {
  const p = await searchParams;
  const q = (p.q ?? '').trim();
  const tipo = p.tipo === 'club' || p.tipo === 'jugador' ? p.tipo : '';
  const fed = (p.fed ?? '').trim();
  const temp = (p.temp ?? '').trim();

  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Buscar" motivo={motivo} />;

  const url = (cambios: { tipo?: string; fed?: string; temp?: string }) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    const t = cambios.tipo ?? tipo;
    const f = cambios.fed ?? fed;
    const te = cambios.temp ?? temp;
    if (t) u.set('tipo', t);
    if (f) u.set('fed', f);
    if (te) u.set('temp', te);
    return `/buscar?${u.toString()}` as Route;
  };

  let federaciones: FilaFederacionCanonica[] = [];
  let temporadas: Array<{ valor: string; etiqueta: string }> = [];
  let filas: FilaBusqueda[] = [];
  try {
    federaciones = await consulta<FilaFederacionCanonica>(
      FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);
    // Las temporadas que se ofrecen salen del canónico, no de una lista escrita a mano: una temporada
    // sin ninguna edición importada no se ofrece, porque un filtro que no puede devolver nada es una
    // promesa falsa.
    const facetas = await consulta<FilaFaceta>(
      FACETAS_DEL_CATALOGO.sql, PARAMETROS_CATALOGO[FACETAS_DEL_CATALOGO.nombre]);
    temporadas = agrupaFacetas(facetas).temporadas;
    // Menos de dos letras no se busca: un patrón de un carácter sobre millones de filas no es una
    // búsqueda, es un recorrido. El canónico no se castiga por una tecla.
    if (q.length >= 2) {
      filas = await consulta<FilaBusqueda>(BUSQUEDA_POR_NOMBRE.sql,
        [q, fed || null, tipo || null, temp || null, 60]);
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Buscar" motivo={error.message} />;
    throw error;
  }

  const conDatos = federaciones.filter((f) => f.ediciones > 0);
  const total = filas[0]?.total ?? 0;

  const columnas: ColumnaTabla<FilaBusqueda>[] = [
    { clave: 'tipo', titulo: 'Tipo', render: (f) => (f.tipo === 'club' ? 'Club' : 'Jugador') },
    {
      clave: 'nombre', titulo: 'Nombre',
      render: (f) => (
        <>
          {f.nombre}
          {f.tipo === 'jugador' && f.identidad_nominal && (
            <span className="ml-1 text-nota text-[var(--revision)]" title="identidad nominal: asignada sin código federativo">nominal</span>
          )}
        </>
      ),
    },
    { clave: 'contexto', titulo: 'Contexto', render: (f) => f.tipo === 'club' ? '—' : texto(f.contexto) },
  ];

  return <>
    <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Buscar</h1>
    <p className="mt-1 text-tabla text-[var(--texto-suave)]">
      Castilla y León · clubes y jugadores con nombre publicado
    </p>

    <form action="/buscar" className="mt-5 grid gap-3 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4 sm:grid-cols-[1fr_10rem_auto]">
      <label>
        <span className={`${ETIQUETA_FILTRO}`}>Nombre</span>
        <input name="q" defaultValue={q} className={`${CONTROL_FILTRO}`} placeholder="Jugador o club…" />
      </label>
      <label>
        <span className={`${ETIQUETA_FILTRO}`}>Temporada</span>
        <select name="temp" defaultValue={temp} className={`${CONTROL_FILTRO}`}>
          <option value="">Todas</option>
          {temporadas.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>
      </label>
      <div className="flex items-end">
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <button className={`${BOTON_PRIMARIO} w-full`}>Buscar</button>
      </div>
    </form>

    <nav aria-label="Tipo de resultado" className="mt-3 flex flex-wrap items-center gap-2">
      {TIPOS.map((t) => (
        <Link key={t.valor || 'todo'} href={url({ tipo: t.valor })}
          aria-current={(tipo === t.valor) ? 'true' : undefined}
          className={(tipo === t.valor) ? BOTON_PRIMARIO : BOTON_SECUNDARIO}>
          {t.etiqueta}
        </Link>
      ))}
    </nav>

    {(tipo || fed || temp) && (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--texto-suave)]">Filtros activos:</span>
        {tipo && <Chip nombre={tipo === 'club' ? 'tipo club' : 'tipo jugador'} quitar={url({ tipo: '' })}>
          {tipo === 'club' ? 'Sólo clubes' : 'Sólo jugadores'}</Chip>}
        {fed && <Chip nombre="federación" quitar={url({ fed: '' })}>
          {conDatos.find((f) => f.codigo === fed)?.nombre ?? fed}</Chip>}
        {temp && <Chip nombre="temporada" quitar={url({ temp: '' })}>
          Temporada {temporadas.find((t) => t.valor === temp)?.etiqueta ?? temp}</Chip>}
      </p>
    )}

    {q.length < 2 ? (
      <div className="mt-6">
        <Vacio
          titulo="Escribe al menos dos letras"
          motivo="La búsqueda busca por nombre normalizado: no hacen falta las tildes ni los signos, y tolera erratas cortas. Devuelve clubes y jugadores, cada uno con su federación y su contexto."
        />
      </div>
    ) : (
      <>
        <p className="mt-5 text-xs text-[var(--texto-suave)]">
          {total === 0 ? 'Ningún resultado' : `${numero(total)} ${total === 1 ? 'resultado' : 'resultados'}`}
          {total > filas.length && ` · se muestran los ${filas.length} más parecidos`}
          {' · '}buscando «{q}»
        </p>
        <div className="mt-3">
          <TablaDatos
            filas={filas}
            columnas={columnas}
            caption={`Resultados de la búsqueda por «${q}», con su tipo y su contexto.`}
            clave={(f) => `${f.tipo}-${f.entidad_id}`}
            enlaceFila={(f) => (f.tipo === 'club' ? `/explorar/club/${f.entidad_id}` : `/explorar/jugador/${f.entidad_id}`)}
            columnaPrincipal={1}
            vacio={<Vacio
              titulo="Sin resultados"
              motivo={`Ningún club ni jugador del canónico coincide con «${q}». Puede ser que no esté importado todavía: no es que no exista.`}
              accion={tipo || fed ? { texto: 'Quitar los filtros', href: `/buscar?q=${encodeURIComponent(q)}` } : undefined}
            />}
          />
        </div>
        <p className="mt-2 text-etiqueta leading-5 text-[var(--texto-tenue)]">
          Se ordena por similitud del nombre normalizado. El nombre que se enseña es el literal de la
          fuente, no la clave de búsqueda. «nominal» marca una identidad asignada <b>sin código
          federativo</b>: ese enlace no está confirmado, y un nombre igual no une a dos personas.
        </p>
      </>
    )}
  </>;
}
