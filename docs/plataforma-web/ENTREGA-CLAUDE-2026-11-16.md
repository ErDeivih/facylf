# Entrega del 16/11/2026: interfaz, simulación, plan de modelo y plan de ingesta

Qué se cambió, por qué y qué falta. **Nada de esto se ha ejecutado contra la base ni visto en
pantalla**: desde la sesión no se llega al PostgreSQL del PC y la app en marcha (`:3001`) es la build
anterior. Se comprobó lo que se podía sin base (ver «Comprobado»).

## El diagnóstico

El canónico sólo tiene partidos de las jornadas ya jugadas. Tercera Federación, grupo VIII: «Jornada
10 de 34», 90 partidos, la jornada 11 da 404. De eso salen tres de los fallos del encargo:

- **Próximas** abría con la jornada 1 de septiembre: lo único «sin jugar» en la base son aplazados y
  resultados sin recoger.
- **Clasificación estimada al 100 %**: no era probabilidad acumulada ni normalización por puesto. La
  simulación jugaba tres aplazados y daba la liga por terminada.
- **Datos recientes que faltan**: no hay fila de un partido hasta que tiene acta.

## Cambios

| Qué | Dónde | Por qué |
|---|---|---|
| La simulación deduce el calendario que falta en ligas a una o dos vueltas; si el formato no se reconoce, no publica y borra la estimación anterior | `scripts/prediccion/03-simulacion.mjs`, `scripts/lib/calendario-restante.mjs` (+ prueba), migración `0065` | Era la causa del 100 % |
| Proyección como pestaña, con la cabecera y la miga de la competición | `app/explorar/competicion/[id]/proyeccion/page.tsx`, `componentes/competicion/ProyeccionFinal.tsx`, `lib/proyeccion.ts` (+ prueba) | Estaba aislada, sin vuelta |
| Cada porcentaje con su rango: «Acaba 2.º–5.º · 84 %», «Ascenso», «Descenso»; reparto puesto a puesto plegado | los mismos | «P(top 3)» no decía qué sumaba |
| Una estimación que no cubre lo que queda de liga no se enseña: «Proyección pendiente de recalcular» | `simulacionCubreLoQueQueda` | Para que el 100 % desaparezca también antes de recalcular |
| Próximos partidos: sólo sin jugar con fecha de hoy en adelante, por competición › grupo, ventana de 7/14/30 días y filtro de categoría en la URL | `app/explorar/proximas/page.tsx`, `lib/proximas.ts` (+ prueba), `consultas/partidos.ts` | Era una lista plana de pendientes viejos |
| Frescura por competición: «Resultados hasta el 8 nov · 12 partidos pasados sin resultado», también en las que no tienen próximos | consulta `proximos-por-competicion` | Decir cuándo el dato está viejo |
| Matriz de marcadores 0-0 a 4-4 y los cinco más probables, a la vista | `componentes/partidos/MatrizMarcadores.tsx` | Estaba plegada y sin matriz |
| Portada: título que dice qué es, tres accesos, «Últimos resultados» con «Pronóstico previo» | `componentes/inicio/InicioContenido.tsx` | «Una jornada de ejemplo» y la predicción junto al resultado sin decir que era previa |
| Menú: Competiciones · Goleadores · Jugadores · Comparar | `componentes/cabecera/CabeceraSitio.tsx` | «Explorar», «Rankings» y «Ojeo» no decían qué había |
| Pie con tres grupos de enlaces y procedencia de los datos | `componentes/marca/PieSitio.tsx`, `app/layout.tsx` | El pie era la nota de la demo y un enlace suelto |
| Foto de ficha en la cabecera del jugador, sólo con `FACYLF_FOTOS=1` | `lib/fotos.ts`, `api/foto/persona/[id]`, `componentes/fichas/Cabeceras.tsx`, migración `0066` | Decisión del 16/11 |
| Regla de fotos actualizada | `CLAUDE.md`, `DOCTRINA-CALIDAD.md`, `SEGURIDAD-OPERACION.md`, `lib/menores.ts` | Para que la decisión no contradiga al repositorio |
| Pruebas ajustadas a los textos nuevos | `test/inicio.test.ts`, `test/cabecera-sitio.test.ts`, `e2e/pantalla-2.spec.ts` | |

Ya estaban bien y no se tocaron: la web sólo publica Castilla y León (`lib/federaciones-excluidas.ts`)
y el escudo ausente ya pinta un monograma con iniciales y color estable (`componentes/Escudo.tsx`). El
problema de los escudos es de recogida: 36 de 937 clubes.

## Para ponerlo en marcha, en este orden

1. Aplicar `infra/migraciones/0065-…` y `0066-…`.
2. `node scripts/prediccion/03-simulacion.mjs --seco --limite 5` y leer la línea «grupos publicados ·
   sin formato de liga · ya terminados». Si «sin formato» es la mayoría, parar y mirar por qué
   (equipos retirados que siguen inscritos, `jornadas_previstas` vacío). Después, sin `--seco`.
3. `pnpm test`, `pnpm lint`, `pnpm --filter @facylf/web exec tsc --noEmit`.
4. Reconstruir la web.
5. Fotos: sólo si se quiere, `FACYLF_FOTOS=1` en la instancia privada. Sin datos en
   `core.person_asset` no cambia nada.

La web nueva funciona con o sin la 0065 aplicada (la consulta lee las dos columnas por `to_jsonb`).
`03-simulacion.mjs` nuevo **sí** necesita la 0065.

## Comprobado

- `node --test scripts/lib/calendario-restante.test.mjs`: 7 de 7.
- La lógica de `lib/proyeccion.ts` y `lib/proximas.ts`, transpilada y ejecutada con los mismos casos
  que sus pruebas.
- `tsc` sobre los ficheros tocados: sin errores propios. No es el `tsc` del proyecto: en la sesión no
  se resuelven los enlaces de `node_modules`, así que las dependencias externas quedaron sin tipar.
- `node --check` de `03-simulacion.mjs`.

**Sin comprobar:** `vitest`, `lint`, el `tsc` completo, las dos consultas nuevas contra PostgreSQL (plan
y tiempo), y todas las pantallas en el navegador.

## Visto y no arreglado

- **Ficha de equipo**: «Posición 2.º · 3 puntos en 1 partidos» en un equipo con 7 jugados
  (`/explorar/equipo/8871`). La tarjeta lee una clasificación de otra jornada que la racha.
- **Estadísticas generales** (`/explorar/estadisticas`): mezcla categorías. «6,92 goles por partido» y
  una tabla de goleadores donde un alevín con 38 goles encabeza a los de Tercera. Debería exigir
  categoría o competición antes de enseñar un ranking.
- **Encargo A, punto 6** («una explicación que no corresponde a ese equipo»): no la encontré en las
  fichas que abrí. Hace falta la ruta exacta.
- **1-X-2 del ML y matriz del Poisson no cuadran entre sí**: `MODELO-PLAN-2026-11-16.md` §1.
- **Fichas de entrenador, árbitro y campo con horarios**: existen las dos primeras
  (`componentes/oficiales/`); no las revisé. Campo con sus horarios no lo he construido.
- **Jerarquía (un acento, tres tamaños, múltiplos de 4)**: aplicada en lo nuevo. El resto de la app
  usa siete tamaños (`tokens.css`) y no se ha tocado.

## Los otros dos documentos

- `MODELO-PLAN-2026-11-16.md`: matriz, familias e hiperparámetros, variables con fórmula,
  ponderación, registro y los tres primeros experimentos.
- `INGESTA-PLAN-2026-11-16.md`: catálogo de lo esperado, tabla de control con reclamación atómica,
  prioridades, escudos y fotos, avisos. Es diseño: no toca ningún worker.
