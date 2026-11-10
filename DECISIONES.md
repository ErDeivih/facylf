# DECISIONES.md · decisiones de producto de Fondo Popular

Registro corto y en un solo sitio de las decisiones que cambian el producto. Cada entrada dice qué se decidió, por
qué, qué NO se hace y cómo se comprueba.

## 2026-11-10 · Datos personales: se publican (consentimiento), sin caras

**Decisión de David (10/11/2026, corrige una decisión anterior del mismo día).** La federación tiene consentimiento
de tratamiento y **no se muestran caras**, así que la app y la demo **publican los datos personales como están**:
nombres completos de jugadores (también de menores) y de árbitros, con dorsal y minutos. **No se quitan nombres, ni
se reducen a iniciales, ni se numeran.**

Qué NO se hace:

- no se publican **fotos** de personas;
- no se ocultan ni se inicializan nombres por ser menores: hay consentimiento y es una decisión explícita de David;
- no se eliminan rankings ni fichas de equipo por motivos de privacidad.

Estado y comprobación: la redacción de iniciales que se había aplicado por la mañana **se retiró**; la demo vuelve a
publicar nombres completos (578 apariciones en la última foto) y **Ojeo vuelve a estar**. Se mantienen fuera, por
otros motivos, **Rankings** (se quedaba en «Cargando…»: su listado se pide por JS y la foto se sirve sin JS) y las
**fichas de equipo** (sus enlaces daban 404; ahora los enlaces se han quitado y llevan al selector).

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
