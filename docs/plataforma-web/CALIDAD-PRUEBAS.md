# Calidad, pruebas y muestras de oro

Estado: decisión de diseño, 14 de septiembre de 2026. Define cómo se demuestra que un cambio no
rompe datos, tiempos ni accesibilidad. Sin las pruebas de este documento, la Definition of Done de
[PLAN-DESARROLLO.md](PLAN-DESARROLLO.md) no se puede cumplir.

## 1. Qué se prueba y con qué

| Nivel | Herramienta | Qué cubre | Dónde |
|---|---|---|---|
| Dominio | Vitest | clasificación, desempates, rachas, métricas, cobertura | `packages/dominio/test` |
| Parseo | Vitest + ficheros reales | actas y jornadas por adaptador | `packages/ingesta/test` |
| Contrato de consulta | Vitest + PostgreSQL efímero | cada función de `consultas/` contra datos conocidos | `apps/web/test/consultas` |
| Importación | Vitest + PostgreSQL efímero | idempotencia, recuentos, huérfanos, rollback | `packages/canonico/test` |
| Componente | Vitest + Testing Library | estados vacío/parcial/error, teclado | `apps/web/test/componentes` |
| Extremo a extremo | Playwright | los seis recorridos de aceptación | `apps/web/e2e` |
| Accesibilidad | axe-core sobre Playwright | serias y críticas = 0 | dentro del E2E |
| Rendimiento de consulta | script propio + `EXPLAIN` | presupuestos p50/p95 | `scripts/presupuestos.mjs` |
| Rendimiento de página | Lighthouse CI | LCP, INP, CLS y peso de JS | CI |

La pirámide está deliberadamente ancha en el medio: en este proyecto el riesgo no es que un botón
no pinte, es que una consulta devuelva un número plausible y falso.

## 2. Muestras de oro

Una **muestra de oro** es un grupo real, congelado, con sus recuentos esperados escritos a mano y
verificados contra la fuente. Es la única defensa contra "el importador ha cambiado y ahora hay un
2 % menos de goles, pero nadie lo nota".

Cada muestra vive en `pruebas/oro/<federacion>/<grupo>/` con:

```text
origen.sqlite          extracto de la cola real, sólo ese grupo
esperado.json          recuentos y casos concretos
por-que.md             qué rareza representa esta muestra y cómo se verificó
```

`esperado.json` contiene, como mínimo:

```json
{
  "federacion": "castilla-y-leon",
  "temporada": "2025-26",
  "grupo": "...",
  "equipos": 18, "jornadas": 34, "partidos": 306,
  "partidos_con_resultado": 306,
  "actas_disponibles": 306, "actas_parseadas": 306,
  "participaciones": 9214, "eventos": 1873,
  "goles_desde_marcador": 812,
  "goles_desde_eventos": 812,
  "clasificacion_final_top3": ["...", "...", "..."],
  "casos": [
    {"que": "propia puerta beneficia al rival", "acta": "...", "espera": "..."},
    {"que": "acta administrativa 3-0", "acta": "...", "espera": "calidad=administrative"},
    {"que": "homónimos en el mismo grupo", "personas": ["...", "..."], "espera": "no fusionados"}
  ]
}
```

### Muestras obligatorias antes de dar por buena la fase 1

Una por tipo de problema, no una por federación bonita:

| Muestra | Federación | Rareza que representa |
|---|---|---|
| `cyl-salamanca-juvenil` | Castilla y León | caso completo y rico; línea base |
| `madrid-isquad-parcial` | Madrid | actas iSquad completas y fichas sin alineaciones dentro de una cobertura histórica parcial |
| `valencia-tercera` | C. Valenciana | JSON con minutos, cambios y subtipos de gol fiables |
| `cataluna-grupo-verificado` | Cataluña | clasificación oficial que cuadra con 240 actas reconstruidas |
| `canarias-corto` | Canarias | poca profundidad histórica, cobertura baja |
| `andalucia-catalogo` | Andalucía | 9.269 competiciones: facetas y recuentos a escala |
| `pnfg-sin-condicion` | cualquiera PNFG | actas que no distinguen titular de suplente |
| `grupo-a-medias` | la que sea | temporada en curso con 14 de 30 jornadas cerradas |

`grupo-a-medias` es la más importante para la web y la que más se olvida: es el estado normal
durante los próximos meses.

### Qué comprueba el test de una muestra

1. Importar de cero → recuentos exactos.
2. Importar otra vez → mismo estado, cero filas nuevas (idempotencia).
3. Importar por mitades → mismo estado que de una vez.
4. `goles_desde_marcador == goles_desde_eventos`, o discrepancia registrada como incidencia, nunca
   silenciada.
5. La clasificación reconstruida coincide con `standing_snapshot` oficial, o la diferencia queda
   explicada.
6. Los agregados recalculados desde cero coinciden con los incrementales.
7. Ninguna persona fusionada sin `identity_decision`.

## 3. Presupuestos que se comprueban, no que se desean

De [ARQUITECTURA.md](ARQUITECTURA.md) §7, convertidos en aserciones:

| Recorrido | p95 servidor | Cómo se mide |
|---|---|---|
| sugerencias de búsqueda | 200 ms | 50 concurrentes, nombres comunes |
| página de competición | 800 ms | grupo de 34 jornadas con rankings |
| perfil de jugador | 800 ms | 10 temporadas, varios equipos |
| listado con todas las facetas | 800 ms | catálogo de Andalucía |
| acta | 300 ms | acta con 40 participaciones |

Más dos reglas estructurales que fallan el build:

- **Ninguna consulta sin `LIMIT`.** Un test recorre `consultas/` y lo verifica.
- **Ningún `Seq Scan` sobre una tabla de hechos** en los recorridos críticos. El plan de cada consulta
  crítica se guarda en `pruebas/planes/` y se compara; si cambia, el test falla y obliga a revisar,
  no a actualizar el fichero sin mirar.

Referencia de partida medida hoy y que hay que batir: la búsqueda global con "todas" las
federaciones tarda **77,7 s** contra las dieciocho SQLite. El objetivo de 200 ms no es una mejora
del 10 %, es un cambio de arquitectura, y por eso es la primera consulta que se migra.

## 4. Recorridos E2E

Los seis criterios de aceptación de [PRODUCTO-UX.md](PRODUCTO-UX.md) §13, cada uno como prueba
Playwright que se ejecuta en móvil (360×740) y escritorio (1280×800):

1. encontrar una competición de Salamanca en menos de tres interacciones;
2. abrir una jornada y su partido;
3. ir del acta al jugador y volver conservando el contexto;
4. distinguir equipo, club y categoría;
5. distinguir una cifra completa de una estimada;
6. buscar `daniel garcia` sin tildes y encontrar `Daniel García`.

Más tres recorridos de datos imperfectos, que son los que de verdad rompen:

7. una competición de Madrid con actas pendientes se navega entera y **en ningún punto aparece un
   0 de goleadores** por falta de cobertura: aparece `Pendiente` o `Sin datos en esta acta`;
8. un grupo con 14 de 30 jornadas muestra "completa hasta J14" en cabecera, clasificación y
   rankings, y ningún promedio sin denominador;
9. dos homónimos en federaciones distintas aparecen como dos resultados con contexto distinto.

Cada recorrido termina con una pasada de `axe`; cero incidencias serias o críticas.

## 5. Datos para desarrollar sin esperar a la recolección

Comandos previstos para la fase 1, todavía no implementados: `datos:semilla` (modos completo, vacío
y parcial) y `datos:sintetico`. Hasta que existan en `package.json` no deben aparecer en una guía de
arranque ni darse por ejecutados.

El generador sintético produce nombres inventados y respeta las distribuciones reales (longitud de
nombres, homónimos, actas incompletas, minutos ausentes). Sirve para medir planes de consulta e
índices con volumen objetivo sin mover datos personales de menores a ningún entorno de pruebas.

## 6. Integración continua

En cada `push`:

1. `tsc --noEmit` de todos los paquetes;
2. Vitest de dominio, parseo y componentes;
3. PostgreSQL efímero en contenedor → migraciones → muestras de oro → contratos de consulta;
4. build de la web;
5. Playwright + axe contra el build con las muestras cargadas;
6. Lighthouse CI sobre tres rutas: portada, competición y perfil de jugador;
7. script de presupuestos de consulta con `EXPLAIN (ANALYZE, BUFFERS)`.

Falla la rama si: baja la cobertura de dominio, aparece una consulta sin límite, un plan crítico
cambia, `axe` encuentra algo serio, o un presupuesto se supera en más de un 20 %.

Los pasos 3, 5, 6 y 7 no se ejecutan en el equipo que corre los diecisiete recolectores: compiten
por CPU y disco con la recolección. Se lanzan a mano antes de cerrar una fase, o en una máquina
distinta.

## 7. Revisión manual antes de cerrar una fase

Lo que ninguna prueba automática detecta, y por eso se mira con los ojos:

- una tabla con un nombre de 45 caracteres y otra con uno de 4;
- la misma pantalla en tema oscuro y densidad compacta;
- un grupo sin ningún partido jugado todavía;
- un jugador con una sola convocatoria y ningún minuto;
- una competición con dos grupos y otra con dieciséis;
- la web con el publicador escribiendo a la vez.
