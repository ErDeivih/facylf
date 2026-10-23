import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

/**
 * Componentes compartidos del inventario de SISTEMA-DISENO.md §5.
 *
 * Son las piezas que usan las DOS espinas del front (ver FRONT-PROPUESTA.md): la de competición y la
 * de entidad. Van en un solo fichero porque comparten los mismos datos de entrada y así se revisan de
 * una vez; cada uno cumple las reglas de DESIGN.md por su cuenta.
 *
 * Reglas que estos componentes hacen cumplir, y que son la razón de que existan:
 *
 * 1. **Ningún dato ausente se muestra como cero.** `Vacio`, `SinCapacidad` e `InsigniaCobertura`
 *    existen para que el hueco tenga su propio texto en vez de un `0` o un guion mudo.
 * 2. **Nunca sólo color.** La insignia de cobertura y la racha llevan texto además del color: un
 *    daltónico y una impresión en blanco y negro tienen que dar la misma lectura.
 * 3. **`tabular-nums` en toda columna numérica.** Sin eso una columna de goles no se lee.
 * 4. **Nada de colores literales**: todo sale de los tokens de `tokens.css`.
 * 5. **La fila entera es enlazable**, con un solo enlace real (no un `onClick` sobre un `tr`), para que
 *    el teclado y el lector de pantalla lo entiendan.
 *
 * Todos son componentes de servidor: no usan estado ni efectos. La interactividad vive en `Buscador`
 * y en los controles que ya existen aparte.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Tabla
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type ColumnaTabla<F> = {
  /** Propiedad de la fila que se pinta, o `null` si la columna se pinta con `render`. */
  clave: (keyof F & string) | null;
  titulo: string;
  /** `numero` alinea a la derecha y aplica `tabular-nums`. Por defecto `texto`. */
  tipo?: 'texto' | 'numero';
  /** Abreviatura del encabezado; se envuelve en `<abbr title="titulo">`. */
  abreviatura?: string;
  render?: (fila: F) => ReactNode;
};

/**
 * Tabla de datos genérica.
 *
 * En móvil **no colapsa a tarjetas**: fija la primera columna y desplaza el resto en horizontal
 * dentro de su contenedor. Colapsar a tarjetas destruye la comparación entre filas, que es justamente
 * para lo que existe una tabla. El documento nunca se desplaza en horizontal; el contenedor sí.
 *
 * `caption` es obligatorio aunque se oculte: es lo que anuncia un lector de pantalla al entrar.
 */
export function TablaDatos<F>({ filas, columnas, caption, clave, enlaceFila, columnaPrincipal, vacio }: {
  filas: readonly F[];
  columnas: readonly ColumnaTabla<F>[];
  caption: string;
  clave: (fila: F) => string | number;
  /** Si devuelve una ruta, esa fila es navegable entera. */
  enlaceFila?: (fila: F) => string;
  /** Índice de la columna que contiene el enlace de la fila. Por defecto, la primera. */
  columnaPrincipal?: number;
  /** Qué enseñar cuando no hay filas. Nunca una tabla vacía sin explicación. */
  vacio?: ReactNode;
}) {
  if (filas.length === 0) {
    return <>{vacio ?? <Vacio titulo="Sin filas" motivo="No hay datos que cumplan los filtros." />}</>;
  }
  const principal = columnaPrincipal ?? 0;
  return (
    <div className="overflow-x-auto border border-[var(--borde)]">
      <table className="w-full border-collapse text-left text-[0.8125rem] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--borde)]">
            {columnas.map((c, i) => (
              <th
                key={c.clave ?? `c${i}`}
                scope="col"
                className={[
                  'whitespace-nowrap px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--texto-suave)]',
                  i === principal ? 'sticky left-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)]' : '',
                  c.tipo === 'numero' ? 'text-right' : 'text-left',
                ].join(' ')}
              >
                {c.abreviatura ? <abbr title={c.titulo} className="no-underline">{c.abreviatura}</abbr> : c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const destino = enlaceFila?.(fila);
            return (
              <tr key={clave(fila)} className="border-b border-[var(--borde)] last:border-b-0 hover:bg-[var(--fondo-sutil)]">
                {columnas.map((c, i) => {
                  const contenido = c.render
                    ? c.render(fila)
                    : c.clave
                      ? String(fila[c.clave] ?? '')
                      : null;
                  // Sólo la columna principal lleva el enlace: un enlace por fila, no uno por celda.
                  const esPrincipal = i === principal && destino && c.render === undefined;
                  return (
                    <td
                      key={c.clave ?? `c${i}`}
                      className={[
                        'px-3 py-1.5 align-middle',
                        i === principal ? 'sticky left-0 z-[var(--capa-pegajoso)] bg-[var(--fondo-elevado)]' : '',
                        c.tipo === 'numero' ? 'text-right' : '',
                      ].join(' ')}
                    >
                      {esPrincipal
                        ? <Link href={destino as Route} className="text-[var(--accion)] hover:underline">{contenido}</Link>
                        : contenido}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Filtros
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Un filtro activo, eliminable. El texto del `aria-label` dice QUÉ quita, no que es una «x». */
export function Chip({ children, quitar, nombre }: {
  children: ReactNode; quitar: string; nombre: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 border border-[var(--borde)] bg-[var(--fondo-sutil)] py-0.5 pl-2 pr-1 text-xs">
      {children}
      <Link
        href={quitar as Route}
        aria-label={`Quitar el filtro ${nombre}`}
        className="px-1 text-[var(--texto-tenue)] hover:text-[var(--accion)]"
      >
        <span aria-hidden="true">×</span>
      </Link>
    </span>
  );
}

/**
 * Una opción de faceta con su recuento.
 *
 * Cuando el recuento es cero **se deshabilita, no se oculta**: esconderla haría creer que esa opción
 * no existe, y lo que ocurre es que no tiene resultados con los filtros actuales.
 */
export function Faceta({ nombre, recuento, href, activa = false }: {
  nombre: string; recuento: number | null; href: string; activa?: boolean;
}) {
  const sinResultados = recuento === 0;
  const etiqueta = recuento === null ? nombre : `${nombre} (${recuento})`;
  if (sinResultados || recuento === null) {
    return (
      <span aria-disabled="true" title={sinResultados ? 'Sin resultados con los filtros actuales' : 'Sin medir'}
            className="block px-2 py-1 text-xs text-[var(--texto-tenue)]">
        {etiqueta}
      </span>
    );
  }
  return (
    <Link
      href={href as Route}
      aria-current={activa ? 'true' : undefined}
      className={[
        'block px-2 py-1 text-xs hover:bg-[var(--fondo-sutil)]',
        activa ? 'font-semibold text-[var(--accion)]' : 'text-[var(--texto)]',
      ].join(' ')}
    >
      {etiqueta}
    </Link>
  );
}

/**
 * Paginación por cursor.
 *
 * Conserva el resto de `searchParams` en los enlaces —los construye quien la usa— para que atrás,
 * adelante y compartir un enlace sigan funcionando. Un paginador por `offset` sin orden completo
 * repite o pierde filas.
 */
export function Paginador({ anterior, siguiente, desde, hasta, total }: {
  anterior: string | null; siguiente: string | null; desde: number; hasta: number; total: number | null;
}) {
  return (
    <nav aria-label="Paginación" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
      <p className="text-[var(--texto-suave)] tabular-nums">
        {total === null
          ? `Mostrando ${desde}–${hasta} · total sin medir`
          : `Mostrando ${desde}–${hasta} de ${total}`}
      </p>
      <p className="flex gap-2">
        {anterior
          ? <Link href={anterior as Route} className="boton-secundario">← Anterior</Link>
          : <span aria-disabled="true" className="boton-secundario opacity-50">← Anterior</span>}
        {siguiente
          ? <Link href={siguiente as Route} className="boton-secundario">Siguiente →</Link>
          : <span aria-disabled="true" className="boton-secundario opacity-50">Siguiente →</span>}
      </p>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Cobertura, procedencia y capacidad
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export type EstadoCobertura =
  | 'completa' | 'hasta_jornada' | 'parcial' | 'no_publicada' | 'a_revisar' | 'sin_medir';

const COBERTURA: Record<EstadoCobertura, { texto: string; color: string }> = {
  completa:     { texto: 'cobertura completa', color: 'var(--cobertura-completa)' },
  hasta_jornada: { texto: 'cobertura parcial', color: 'var(--cobertura-parcial)' },
  parcial:      { texto: 'cobertura parcial', color: 'var(--cobertura-parcial)' },
  no_publicada: { texto: 'no publicada por la fuente', color: 'var(--cobertura-nula)' },
  a_revisar:    { texto: 'a revisar', color: 'var(--revision)' },
  sin_medir:    { texto: 'cobertura sin medir', color: 'var(--cobertura-nula)' },
};

/**
 * La insignia de cobertura. **Es obligatoria** en cualquier vista que enseñe métricas derivadas.
 *
 * Lleva texto además de color (regla 2 de la cabecera). Cuando el estado es «hasta jornada» se dice
 * hasta cuál, porque «parcial» sin el número no permite saber si la cifra es interpretable.
 */
export function InsigniaCobertura({ estado, hastaJornada, nota }: {
  estado: EstadoCobertura; hastaJornada?: number | null; nota?: string | null;
}) {
  const { texto, color } = COBERTURA[estado];
  const completo = estado === 'hasta_jornada' && hastaJornada != null
    ? `completa hasta J${hastaJornada}`
    : texto;
  return (
    <span
      title={nota ?? undefined}
      className="inline-flex items-center gap-1.5 border border-[var(--borde)] px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--texto-suave)]"
    >
      <span aria-hidden="true" className="inline-block h-2 w-2" style={{ background: color }} />
      {completo}
    </span>
  );
}

/**
 * La procedencia de un dato, en lenguaje humano: de dónde salió, cuándo se midió y con qué versión de
 * parser. Una cifra sin fecha de medición no se enseña, y este componente es el que la lleva.
 */
export function Procedencia({ fuente, portalUrl, medidoEn, parserVersion }: {
  fuente: string; portalUrl?: string | null; medidoEn: string | null; parserVersion?: string | null;
}) {
  return (
    <p className="text-[0.6875rem] leading-5 text-[var(--texto-tenue)]">
      Fuente: {portalUrl
        ? <a href={portalUrl} target="_blank" rel="noreferrer" className="hover:text-[var(--accion)]">{fuente} ↗</a>
        : fuente}
      {' · '}
      {medidoEn ? `medido el ${medidoEn}` : 'sin fecha de medición'}
      {parserVersion ? ` · parser ${parserVersion}` : ''}
    </p>
  );
}

/**
 * La federación no publica este dato.
 *
 * Distinto de «no hay datos en este caso» y de «pendiente de recoger»: aquí la fuente **nunca** lo
 * ofrece, y por eso el bloque enlaza a la matriz de capacidades en vez de pedir paciencia. Es
 * obligatorio en cualquier vista que pueda quedarse sin métricas individuales.
 */
export function SinCapacidad({ federacion, capacidad, nota }: {
  federacion: string; capacidad: string; nota?: string | null;
}) {
  return (
    <div className="border-l-4 border-[var(--cobertura-nula)] bg-[var(--fondo-sutil)] p-3 text-[0.8125rem] leading-6 text-[var(--texto-suave)]">
      <p><b className="text-[var(--texto)]">{federacion} no publica {capacidad}.</b> No es que falten datos: la fuente nunca ofrece este campo, así que aquí no aparecerá por mucho que se espere.</p>
      {nota && <p className="mt-1">{nota}</p>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Estados de la vista
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Estado vacío. Dice qué falta **y ofrece la acción que lo arregla**: quitar un filtro, cambiar de
 * temporada. Un vacío que sólo dice «no hay resultados» obliga al usuario a adivinar.
 */
export function Vacio({ titulo, motivo, nota, accion }: {
  titulo: string; motivo: string; nota?: string; accion?: { texto: string; href: string };
}) {
  return (
    <div className="border border-dashed border-[var(--borde-fuerte)] p-6 text-center">
      <p className="text-[0.8125rem] font-semibold text-[var(--texto)]">{titulo}</p>
      <p className="mt-1 text-[0.8125rem] leading-6 text-[var(--texto-suave)]">{motivo}</p>
      {nota && (
        <p className="mx-auto mt-2 max-w-2xl text-[0.6875rem] leading-5 text-[var(--texto-tenue)]">{nota}</p>
      )}
      {accion && <p className="mt-3"><Link href={accion.href as Route} className="boton-secundario">{accion.texto}</Link></p>}
    </div>
  );
}

/**
 * Esqueleto de carga con las **mismas dimensiones que el contenido real**.
 *
 * Nunca un spinner centrado: al resolverse desplazaría la página y el usuario perdería el sitio donde
 * estaba leyendo.
 */
export function Esqueleto({ filas = 6, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div aria-hidden="true" className="border border-[var(--borde)]">
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex gap-3 border-b border-[var(--borde)] px-3 last:border-b-0" style={{ height: 'var(--fila)' }}>
          {Array.from({ length: columnas }, (_, c) => (
            <div key={c} className="my-2 flex-1 bg-[var(--fondo-sutil)]" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Error recuperable: mensaje humano, identificador de incidencia y reintento.
 *
 * **Sin SQL, sin rutas y sin traza**: el detalle técnico va al registro del servidor. El identificador
 * existe para poder cruzar el aviso del usuario con ese registro, y en Next es `error.digest`, que es
 * justo para eso.
 *
 * Dos formas de reintentar, y no es lo mismo: `alReintentar` vuelve a renderizar el segmento sin salir
 * de la página (lo que da un `error.tsx`), y `reintentar` navega a una ruta. Se admite la primera
 * cuando existe, porque recargar la página entera para reintentar un trozo es peor.
 */
export function ErrorRecuperable({ mensaje, incidencia, reintentar, alReintentar }: {
  mensaje: string; incidencia: string; reintentar?: string; alReintentar?: () => void;
}) {
  return (
    <div role="alert" className="border-l-4 border-[var(--revision)] bg-[var(--fondo-sutil)] p-4">
      <p className="text-[0.8125rem] font-semibold text-[var(--texto)]">{mensaje}</p>
      <p className="mt-1 text-[0.6875rem] text-[var(--texto-tenue)]">Incidencia: <code>{incidencia}</code></p>
      <p className="mt-3">
        {alReintentar
          ? <button type="button" onClick={alReintentar} className="boton-secundario">Reintentar</button>
          : reintentar
            ? <Link href={reintentar as Route} className="boton-secundario">Reintentar</Link>
            : null}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Dominio
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Marcador de un partido. Inventario de SISTEMA-DISENO.md §5 (`Marcador`).
 *
 * La regla que centraliza, y la razón de que exista: **un marcador sin publicar no es 0-0**. Se dice
 * «sin resultado publicado», nunca un cero, porque un `0-0` se lee como un partido jugado y sin goles,
 * y aquí significa que la fuente no lo ha publicado. Es el error que este proyecto persigue en toda la
 * web, y tenerlo escrito **una sola vez** es lo que impide que se arregle en una pantalla y se rompa
 * en otra. Hasta ahora estaba reimplementado a mano en la ficha de equipo y en la página de grupo.
 *
 * `tabular-nums` no es decorativo: un marcador comparte columna con otros y sin él los dígitos bailan.
 */
export function Marcador({ local, visitante }: { local: number | null; visitante: number | null }) {
  if (local === null || visitante === null) {
    return <span className="text-[var(--texto-tenue)]">sin resultado publicado</span>;
  }
  return <b className="tabular-nums whitespace-nowrap">{local}-{visitante}</b>;
}

/**
 * Aviso de identidad nominal. Inventario de SISTEMA-DISENO.md §5 (`IdentidadPersona`).
 *
 * `true` aquí significa que a la persona se le asignó identidad **sin código federativo**, por el
 * contexto de su equipo y su nombre. La regla que hace visible, y no es cosmética: **un nombre igual no
 * une a dos personas**. Presentar como hecho un enlace probable es inventar, y en este proyecto las
 * decisiones de identidad son reversibles precisamente porque pueden ser erróneas.
 *
 * Va aparte del marcador compacto que usa la búsqueda («nominal» en una celda): aquí el aviso es el
 * bloque largo que explica *por qué* las temporadas aparecen juntas, y allí basta con señalar que el
 * enlace no está confirmado.
 */
export function IdentidadPersona({ decisiones }: { decisiones: number }) {
  return (
    <div className="mt-3 border-l-4 border-[var(--revision)] bg-[var(--fondo-sutil)] p-3 text-[0.8125rem] leading-6 text-[var(--texto-suave)]">
      <b className="text-[var(--texto)]">Identidad nominal, no confirmada.</b> A esta persona se le
      asignó identidad por el contexto de su equipo y su nombre, <b>sin código federativo</b>. Sus
      temporadas aparecen juntas porque el nombre y el equipo encajan, no porque haya una prueba de que
      sea la misma persona. En este proyecto un nombre igual no une a dos personas
      {decisiones === 0
        ? ', y no hay ninguna decisión de identidad registrada que lo confirme.'
        : `, aunque aquí hay ${decisiones} decisión(es) de identidad registrada(s).`}
    </div>
  );
}

/**
 * Escudo de un club: marcador de posición determinista. Inventario de SISTEMA-DISENO.md §5 (`Escudo`).
 *
 * Dos reglas que aplica, y las dos son de `SISTEMA-DISENO.md`:
 *
 * 1. **Tamaño fijo.** Un escudo sin dimensiones reservadas provoca un salto de layout cuando la imagen
 *    llega, y eso mueve el texto que el usuario está leyendo. Aquí no hay imagen: hay un cuadrado de
 *    tamaño fijo con las iniciales, así que el hueco está reservado desde el primer byte.
 * 2. **Determinista.** Las iniciales salen del nombre canónico, y la misma entrada da siempre el mismo
 *    resultado: un escudo que cambia entre visitas es peor que no tener escudo.
 *
 * **Lo que este componente NO hace, a propósito:** derivar un color por club. §5 lo pide —«iniciales
 * sobre color derivado del identificador»— y §2 prohíbe los colores literales en componentes, que es
 * justo lo que hace falta para generar uno a partir de un identificador. Se podría con una paleta de
 * tokens propia (`--escudo-1` … `--escudo-n`), y no está hecha; hasta entonces se usa el acento, que
 * existe, en vez de inventar un color en el componente. Un color falso no es mejor que ningún color.
 */
export function Escudo({ nombre, tamano = 40 }: { nombre: string; semilla?: number; tamano?: number }) {
  const iniciales = nombre
    .replace(/["'()]/g, ' ')
    .split(/[\s.]+/)
    .filter((p) => p.length > 1 && !/^(c\.?d\.?|c\.?f\.?|s\.?d\.?|u\.?d\.?|s\.?a\.?d\.?)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      style={{ width: tamano, height: tamano, fontSize: Math.round(tamano * 0.4) }}
      className="inline-flex shrink-0 items-center justify-center border border-[var(--borde)] bg-[var(--accion-suave)] font-display font-semibold uppercase text-[var(--accion)]"
    >
      {iniciales || '·'}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Navegación
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Miga de pan. Inventario de SISTEMA-DISENO.md §5 (`Miga`).
 *
 * Regla que aplica: **el último tramo es el actual y no lleva enlace**. Un enlace a la página en la
 * que ya estás es una promesa de que pasa algo al pulsarlo. Los anteriores sí lo llevan, porque son el
 * camino de vuelta, y ese es justo el recorrido que el proyecto quiere que se conserve entre federación,
 * competición, equipo y jugador.
 */
export function Miga({ tramos }: { tramos: readonly { texto: string; href?: string }[] }) {
  return (
    <nav aria-label="Miga de pan" className="mb-4 flex flex-wrap items-center gap-x-2 text-xs text-[var(--texto-tenue)]">
      {tramos.map((t, i) => (
        <span key={`${t.texto}-${i}`} className="flex items-center gap-x-2">
          {i > 0 && <span aria-hidden="true">/</span>}
          {t.href
            ? <Link href={t.href as Route} className="hover:text-[var(--accion)] hover:underline">{t.texto}</Link>
            : <span aria-current={i === tramos.length - 1 ? 'page' : undefined}>{t.texto}</span>}
        </span>
      ))}
    </nav>
  );
}
