# ¿Hay webs que den los mismos datos más rápido? (25/10/2026)

> Lo pidió David: buscar plataformas con los resultados y datos que ingerimos, pero más fáciles o rápidas, para
> acelerar y luego comprobar con las federaciones. Lo escribió Claude. Se miró en el navegador, como un usuario: unas
> pocas páginas por sitio, sin cuenta y rechazando cookies. Se contrastó con la cola de CyL del PC (petición 216).

## Resumen

1. **Las webs de terceros no aceleran las actas.**
   - La única que llega al detalle del acta en categorías regionales es **BeSoccer** (resultados-futbol.com), y es una copia de la federación.
   - Esa copia tiene menos calidad: sin códigos de jugador y con nombres abreviados.
   - Cubre sólo una parte de las competiciones y sus condiciones de uso prohíben reproducir sus datos.
2. **El atajo bueno está en la propia federación: la «tabla cruzada» de cada grupo.**
   - Una sola página da **todos los resultados del grupo** y la jornada de cada partido.
   - En CyL, **1.217 páginas** dan los resultados de las **20.172 jornadas que aún no hemos leído** (unos 94.000 partidos).
   - Eso es **un día de recolector** en lugar de semanas.
   - Las actas (alineaciones, goles, tarjetas) se siguen pidiendo una a una.
3. **El otro acelerador: el ritmo de CyL.**
   - CyL va a 10-13 s por petición porque la piden dos máquinas a la vez; las demás federaciones van a 6-8 s.
   - Cuando la pida una sola (cambio del 30/10-1/11, `REPARTO-CYL-2026-10-25.md`), puede ir a 6-8 s sin pasar de la regla de 5-8 s por sitio: **~1,6 veces más rápido**.

## 1. Plataformas revisadas

| Plataforma | Qué tiene de CyL | ¿Sirve para acelerar? | Condiciones |
|---|---|---|---|
| **BeSoccer / resultados-futbol.com** | Categorías regionales altas, también de base (p. ej. 1.ª Regional Cadete), desde 2011-12. Por partido: goles, tarjetas y cambios con su minuto, y alineaciones. **No** se vieron provinciales ni benjamines. | **No.** Es una copia del acta (abajo), con menos calidad y sólo para una parte. | El aviso legal prohíbe reproducir o distribuir sus contenidos sin autorización. Tienen una **API de pago** (api@besoccer.com, sin precios publicados). robots.txt permite las páginas y veta `/ajax`. |
| **La Preferente** | Resultados y clasificaciones de casi todo, goleadores, estadísticas por jugador y **fichas de partido** en las categorías altas recientes. | **Corregido el 25/10:** sí tiene fichas, que son el acta transcrita, y un histórico desde los años 40. Ver `LA-PREFERENTE-2026-10-25.md`. Sin ficha, lo meten colaboradores. | robots.txt permisivo; ya hay un adaptador (`lapreferente`) para lo no federado. |
| **Futbolme** | Sobre todo de 3.ª Federación hacia arriba y fases de ascenso. | **No.** No llega a provinciales; su API (`/json/`) está vetada en robots.txt. | — |
| **siguetuliga** | Copias de competiciones de la FCyL hechas por usuarios. | **No.** Ya se descartó el 11/10: son copias y ya se recogen de la federación. | — |
| **API comerciales** (API-Football y similares), **SofaScore, Flashscore, Soccerway, Transfermarkt** | De 3.ª Federación hacia arriba, como mucho. | **No.** No llegan al fútbol regional ni provincial. Además prohíben la extracción. | — |

### La prueba: BeSoccer frente a nuestra cola (petición 216)
- **Muestra:** 1.ª División Regional de Cadetes, jornada 30 de 2025-26 (9-10/05/2026), sin nombres de jugadores (menores).
- **Marcadores:** **8 de 8 iguales**.
- **Partido Salamanca UDS 3-3 Amistad Saborea:**
  - los **6 goles** y los **6 cambios** coinciden minuto a minuto con lo que guardamos del acta;
  - la amarilla que en el acta **no tiene minuto**, BeSoccer la pone en el **90'**: se lo inventa.
- **Conclusión:** BeSoccer transcribe el acta de la federación. Para lo que cubre no da nada que no tengamos, y lo da peor:
  - minutos inventados donde el acta no los tiene;
  - nombres como «D. Miguel»;
  - ningún código de jugador, sin el que no se pueden seguir jugadores entre temporadas.

## 2. El atajo de la federación: la tabla cruzada (PNFG)

- **Qué es:** `NFG_VisTablaCruzada?cod_primaria=1000120&CodGrupo=<grupo>`.
  - Es la tabla «todos contra todos» de un grupo. Cada casilla trae el marcador y la jornada del partido (`partido(<jornada>)`).
  - Se enlaza desde el calendario de cada grupo, que ya archivamos (`calendario.html`), así que el enlace no se construye a mano.
- **Medido:** el grupo 8947 de 2015-16 (femenino) da en una página **240 partidos con resultado**. En nuestra cola sólo está leída su jornada 1, con 8 partidos.
- **En CyL:** quedan **1.217 grupos** con jornadas sin leer (775 de temporadas del PC y 442 del servidor).
  - A una petición cada 7-12 s, son **3-4 horas**.
  - Con eso se tienen **los resultados y las clasificaciones de las 15 temporadas**, en vez de esperar a leer 20.172 jornadas.
- **Para qué sirve:**
  1. **Resultados y clasificaciones completos ya.** La web puede enseñarlos aunque falten las actas, avisando de que «el detalle del acta llega después».
  2. **El número exacto de partidos y actas que faltan**, por jornada, en lugar de la estimación por media de grupo de `REPARTO-CYL`.
  3. **Comprobar lo ya leído:** cada marcador de jornada contra la tabla cruzada, y los «0-0» de las primeras temporadas contra la tabla y el acta.
  4. **Ordenar las jornadas que quedan:** primero las que tienen partidos jugados; las vacías se saltan.
- **Lo que NO da:** el código del acta. Para las actas hay que seguir leyendo la jornada (una petición) y luego cada acta.
  O sea: **ahorra tiempo en resultados, no en actas**. Las actas son el 86 % de lo que falta.
- **Límites:**
  - sólo sirve en ligas (todos contra todos); en copas y fases finales no hay tabla;
  - con más de dos vueltas, una casilla no distingue los partidos;
  - mismo ritmo y misma identidad que el recolector (FacylfBot, 5-8 s por sitio).
- **Otras federaciones:** las que usan PNFG (Andalucía, Galicia, Aragón, Asturias, Extremadura…) tienen la misma página.
  **No está comprobado** en cada una; hay que mirarlo antes, federación por federación.

### Lo que NO se puede usar de la federación
- **«Consulta de partidos»** (`NFG_LstPartidos`) listaría todos los partidos de un periodo con su acta. Pero la propia página **obliga a filtrar por club o por campo, y en un intervalo de 7 días como mucho**.
- Es un límite puesto a propósito: **no se esquiva** llamando a la página sin esos filtros. Con los filtros sale más caro que leer jornadas.
- **Goleadores por grupo** (`NFG_CMP_Goleadores`): una página por grupo con los goles de cada jugador. Sirve para **comprobar** los goles que sumamos de las actas, no para sustituirlas.

## 3. Propuesta (para David y DeepSeek)

| # | Qué | Coste | Ganancia |
|---|---|---|---|
| 1 | **Tipo de trabajo nuevo `tabla_cruzada`** en el recolector PNFG: una por grupo, con prioridad alta. Su lector rellena los marcadores de los partidos que aún no tienen jornada leída, marcados como «resultado de la tabla, sin acta», y anota cuántos partidos esperan en cada jornada. **No crea actas.** | 1-2 días de código con pruebas. En CyL, 1.217 peticiones. | Resultados y clasificaciones de CyL completos en horas. Cifra exacta de lo que falta. |
| 2 | **CyL a 6-8 s** cuando la recoja una sola máquina (paso 5 del cambio de `REPARTO-CYL-2026-10-25.md`). | Cambiar dos números en la configuración del servidor. | ~1,6 veces más rápido: el fin estimado pasa de 12-14/11 a **~9-10/11**. |
| 3 | **Comprobación cruzada** después: marcador de jornada y acta frente a la tabla cruzada, y goles del acta frente a goleadores. Como regla del vigía. | 1 día. | Atrapa los «0-0» falsos y las actas con goles a medias (los 3.050 de 2022-23). |
| 4 | **BeSoccer, sólo si David quiere pagar:** pedir presupuesto de su API para el fútbol regional de las otras federaciones. Daría el detalle del acta de las categorías regionales altas. | Dinero y un contrato. | Poca: copia de lo que ya da la federación, sin códigos de jugador y sólo de una parte. **No lo recomiendo.** |

**Lo que no se hace:**
- extraer en masa de BeSoccer, Futbolme o La Preferente para publicarlo (sus condiciones lo prohíben);
- usar La Preferente como fuente de verdad (la meten colaboradores a mano);
- esquivar el filtro obligatorio de la consulta de partidos.
