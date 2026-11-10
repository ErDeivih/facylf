# DECISIONES.md · decisiones de producto de Fondo Popular

Registro corto y en un solo sitio de las decisiones que cambian el producto. Cada entrada dice qué se decidió, por
qué, qué NO se hace y cómo se comprueba.

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
