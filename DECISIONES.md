# DECISIONES.md · decisiones de producto de Fondo Popular

Registro corto y en un solo sitio de las decisiones que cambian el producto. Cada entrada dice qué se decidió, por
qué, qué NO se hace y cómo se comprueba.

## 2026-11-10 · Datos personales en la demo pública: iniciales, sin rankings ni fichas de equipo

**Decidido por los dos coordinadores (10/11/2026), por RGPD.** La demo pública es lo único que ve cualquiera:
no puede llevar nombres completos de personas (ni de menores, ni de árbitros), ni páginas que los publiquen.

Qué se hace en la demo (el generador `scripts/claude/espeja-para-pages.mjs` lo aplica al generar la foto):

- **todos los nombres completos se sustituyen por iniciales** («LÓPEZ ROMERA, GONZALO» → «L. R., G.»): jugadores
  y árbitros, en actas, jornadas y estadísticas. Se conserva el resto (marcadores, clasificaciones, alineaciones,
  minutos, tarjetas), que es lo que demuestra el producto;
- **fuera Rankings y Ojeo**: son las dos pantallas que publicaban nombres de jugadores de categorías de menores
  (alevín, benjamín, infantil, cadete, juvenil);
- **fuera las fichas de equipo** (`/explorar/equipo/<id>`) y sus enlaces: la plantilla de un equipo incluye menores.
  Los enlaces se llevan al selector de competiciones, así que no queda ningún 404;
- **el ejemplo de jugador de la demo es adulto** (persona 89502, solo categoría «aficionados»).

Qué NO se hace:

- no se publican nombres de menores ni de árbitros en la demo;
- no se publican plantillas ni listas de goleadores de categorías de menores;
- no se cambia el criterio de la app privada (ahí manda la decisión de David del 05/11 sobre datos de la federación).

Cómo se comprueba: `node tmp/audita-demo-privacidad.mjs` recorre las rutas publicadas y cuenta nombres completos
(debe dar 0), enlaces a equipo (0), rankings (404) y el cartel con «fútbol y fútbol sala». Última pasada: **0 nombres
completos y 489 nombres reducidos a iniciales**.

## 2026-11-10 · Escudos de club: no se copian ni se recolectan sin permiso

**Decidido por los dos coordinadores (10/11/2026).** Los escudos son signos distintivos de cada club y pueden estar
protegidos. La app muestra **iniciales** como representación por defecto y solo enseñará el escudo real **cuando el
club dé permiso** (o exista una autorización documentada).

Qué NO se hace:

- no se copian escudos de la federación ni de una fila de club a otra (aunque sea el mismo club partido en filas);
- no se recolectan escudos del portal de la federación;
- no se deducen de parecidos de nombre.

Qué sí se hace:

- se mantiene el fallback de iniciales (determinista, con las siglas del nombre, `components/Escudo.tsx`);
- se mide y se deja registro de cuántos faltan y por qué: `docs/plataforma-web/ESCUDOS-FALTAN.md` y
  `scripts/claude/lista-escudos.mjs` (sólo lectura);
- si un club autoriza su escudo, se incorpora por el camino de datos normal, dejando en `core.club_asset` la
  referencia del permiso (`fuente_descripcion`).

Estado y comprobación: el 10/11 se copiaron 12 escudos «de hermano» y se revirtieron el mismo día; hoy hay **36
clubes con escudo de 937** (los que ya venían de antes) y el resto sale con iniciales. Las 12 filas copiadas se
borraron (`fuente_descripcion like 'Copiado del club %'`, ya no queda ninguna).
