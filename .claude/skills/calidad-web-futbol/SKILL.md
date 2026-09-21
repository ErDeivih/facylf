---
name: calidad-web-futbol
description: Prueba y mide la plataforma de fútbol de este repositorio — muestras de oro por federación, idempotencia del importador, tests de contrato de consulta, presupuestos de rendimiento con EXPLAIN, recorridos E2E con Playwright, accesibilidad con axe y la Definition of Done. Úsala al escribir o revisar pruebas, al incorporar una federación nueva al canónico, al tocar el importador o una consulta crítica, y antes de dar por cerrada cualquier funcionalidad o fase.
---

# Calidad de la plataforma de fútbol

El riesgo de este proyecto no es que un botón no pinte: es que una consulta devuelva un número
plausible y falso sobre datos incompletos de diecinueve fuentes distintas. Las pruebas están
diseñadas contra eso.

Documento de referencia:
[CALIDAD-PRUEBAS.md](../../../docs/plataforma-web/CALIDAD-PRUEBAS.md).

## Muestras de oro

Una muestra de oro es un grupo real congelado con sus recuentos escritos a mano y verificados contra
la fuente, en `pruebas/oro/<federacion>/<grupo>/`. Es la única defensa contra un importador que
empieza a perder un 2 % de los goles sin que nadie lo note.

Al tocar el importador o al incorporar una federación, la prueba comprueba siempre:

1. importar de cero da los recuentos exactos del `esperado.json`;
2. importar otra vez no cambia nada (idempotencia);
3. importar por mitades da el mismo estado que de una vez;
4. `goles_desde_marcador == goles_desde_eventos`, o la discrepancia queda registrada como incidencia
   estructurada, nunca silenciada;
5. la clasificación reconstruida coincide con la oficial guardada, o la diferencia está explicada;
6. los agregados incrementales coinciden con los recalculados desde cero;
7. ninguna persona fusionada sin una `identity_decision`.

**Una federación no entra en el canónico sin su muestra de oro y sin su fila de
`source_capability` con evidencia.** Las ocho muestras obligatorias cubren tipos de problema, no
federaciones bonitas: caso rico, fuente sin actas (Madrid), JSON con minutos fiables (Valencia),
adaptador propio (Cataluña), cobertura baja (Canarias), catálogo masivo (Andalucía), actas sin
condición titular/suplente, y grupo a medias. La última es la más importante y la que más se olvida:
es el estado normal de los próximos meses.

## Rendimiento

Los presupuestos son aserciones, no deseos: sugerencias de búsqueda 200 ms p95, competición 800 ms,
perfil de jugador 800 ms, listado con todas las facetas 800 ms, acta 300 ms.

Dos reglas estructurales que fallan el build:

- ninguna consulta sin `LIMIT` en `consultas/`;
- ningún `Seq Scan` sobre una tabla de hechos en un recorrido crítico. Los planes se guardan en
  `pruebas/planes/` y se comparan; si un plan cambia, el test falla para que alguien mire, no para
  que se actualice el fichero sin pensar.

Referencia de partida a batir: la búsqueda global contra las dieciocho SQLite tarda **77,7 s**. El
objetivo no es una mejora porcentual, es un cambio de arquitectura.

Mide con `EXPLAIN (ANALYZE, BUFFERS)` sobre volumen realista —el generador sintético produce nombres
inventados con las distribuciones reales— y nunca sobre las veinte filas de una muestra.

## Recorridos E2E

Los seis criterios de aceptación de `PRODUCTO-UX.md` §13, más tres de datos imperfectos, que son los
que de verdad rompen: una competición de Madrid navegada entera sin un solo cero de goleadores; un
grupo con 14 de 30 jornadas que dice "completa hasta J14" en cabecera, clasificación y rankings; y
dos homónimos de federaciones distintas que aparecen separados y con su contexto. Cada recorrido se
ejecuta a 360×740 y a 1280×800, y termina con `axe` sin incidencias serias o críticas.

## Definition of Done

De `PLAN-DESARROLLO.md`, con dos añadidos de este repositorio: la funcionalidad declara qué
capacidades de fuente necesita, y se ha visto en su estado vacío y parcial además del completo. Sin
esas dos cosas, no está hecha.

## Dónde no se ejecutan estas pruebas

Los pasos con PostgreSQL, Playwright, Lighthouse y presupuestos **no** se lanzan en el equipo que
corre los diecisiete recolectores: compiten por CPU y disco con la recolección y falsean las
mediciones. Se lanzan a mano antes de cerrar una fase, o en otra máquina.
