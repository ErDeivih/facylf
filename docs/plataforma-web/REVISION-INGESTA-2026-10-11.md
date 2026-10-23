# Revisión de la ingesta — domingo 11/10/2026 (Claude)

Medido con las peticiones 116–125 del enlace, todas de solo lectura. Herramientas nuevas en `scripts/claude/`:
`estado-colas.mjs`, `ritmo-peticiones.mjs`, `que-sirve.mjs`, `actas-canceladas.mjs` y `competiciones-por-temporada.mjs`.

> **Trampa de medida.** `encola()` hace `actualizado_en = ahora` también en trabajos YA HECHOS cada vez que un
> recolector arranca (`preparaPlan`). Por eso cualquier ritmo calculado con `trabajos.actualizado_en` sale
> inflado: grupos, índices y calendarios «servidos» que en realidad no se han pedido. El ritmo real está en la
> tabla `peticiones` (`ritmo-peticiones.mjs`).

## Ritmo real (peticiones a la web en 24 h)

| Servidor | pet./24 h | actas/24 h | | PC | pet./24 h | actas/24 h |
|---|---|---|---|---|---|---|
| rioja | 7.380 | 4.870 | | federacion (CyL) | 5.021 | 4.976 |
| navarra | 7.215 | 5.872 | | madrid | 4.901 | 3.223 (1.463 «sin publicar») |
| asturias | 7.061 | 4.550 | | andalucia | 4.394 | 220 (descubriendo) |
| aragon | 6.610 | 5.277 | | cataluna | 11 | — (sin trabajo) |
| cantabria | 6.550 | 5.877 | | valencia | 1 | — (bloqueo por token) |
| baleares | 6.087 | 3.747 | | | | |
| extremadura | 6.093 | 4.982 | | | | |
| galicia | 5.932 | 3.952 | | | | |
| murcia | 5.856 | 4.947 | | | | |
| castilla-la-mancha | 4.774 | 3.574 | | | | |
| federacion (CyL) | 4.505 | 2.884 | | | | |
| canarias / ceuta / euskadi / melilla | 0–123 | 0–47 | | | | |

- El servidor hace unas 72.000 peticiones al día y el PC unas 14.000.
- Cada federación activa va a 190–385 por hora, por debajo del tope respetuoso de 450–720 por hora: el límite lo pone la máquina, no la web.
- Las respuestas son casi todas `ok`; no hay bloqueos salvo Valencia.

## Problemas encontrados

1. **La temporada en curso NO va por delante del histórico.**
   - La cola se sirve por `prioridad`, y la cifra la domina la categoría de la competición (`base × 1.000.000`):
     - regional y nacional = 5;
     - 1ª provincial = 60, 2ª provincial = 70;
     - alevín y benjamín = 80, 3ª provincial = 90;
     - el resto = 100.
   - La temporada solo desempata. Así, una regional de 2018-19 (≈5,8 M) va antes que una provincial o una de base de 2026-27 (≈80–100 M).
   - Medido a las 12:45 (`que-sirve.mjs`):
     - Galicia: 381 actas de 2026-27 vencidas; en 3 h sirvió 822 actas de 2021-22 y las de 2026-27 ni aparecen entre lo más servido;
     - otras actas de 2026-27 esperando: Aragón 147, CyL servidor 568, Andalucía (PC) 2.417, Madrid (PC) 444.
   - Las jornadas se despiertan a las 06:00 del día siguiente, así que lo del domingo entra el lunes por la mañana.
   - Arreglo propuesto: un carril «temporada en curso» para jornada, acta, calendario y clasificación de la temporada actual, entre el de descubrimiento y el resto. Cuando no queda nada vencido de la actual, el recolector vuelve solo al histórico.

2. **Temporadas que la web publica y ninguna cola tiene (2010-11 a 2014-15).**
   - `arrancar` llama a `preparaPlan` con `--desde` por defecto 2015 (`numero('desde', 2015)`), aunque el suelo de trabajo (`FACYLF_TEMPORADA_MINIMA`) sea 2010-11.
   - Lo que falta según el catálogo de cada federación (competiciones):
     - Aragón 2010-14: 782;
     - Andalucía 2013-14: 419;
     - CLM 2010-14: 234;
     - Extremadura 2011-14: 187;
     - Euskadi 2010-14: 135;
     - Asturias 2012-14: 59;
     - Navarra 2012-14: 21;
     - CyL 2012-13, 2013-14 y 2014-15: 126, que además no están asignadas a ninguna máquina en `temporadas-asignadas.txt`.
   - Rioja sí las tiene, y además 2008-09 y 2009-10 (2.257 trabajos) por debajo del suelo: nunca se servirán.
   - Arreglo: `preparar --desde 2010` por federación (idempotente), o que el valor por defecto de `--desde` salga de `TEMPORADA_MINIMA`.

3. **Actas descargadas que no se supieron leer y se cancelaron.** ~~Son recuperables arreglando el lector.~~ **CORREGIDO más tarde el mismo día:** con 9 muestras del servidor, la ficha viene publicada SIN alineaciones (marcador y árbitro, «Titulares» vacío, entrenador «No presenta»). No es un fallo del lector; ya se marcan como `sin_datos`.
   - Navarra 2.019 (2014-15 a 2019-20 y 2023-24);
   - Euskadi 762 (2023-24: fútbol sala y femenino RFEF);
   - Rioja 60 (2023-24);
   - CLM 11;
   - Asturias: 206 `acta_ilegible` en las últimas 24 h.
   - Además, unas 40 actas se cancelaron por errores de red pasajeros (ERR_NAME_NOT_RESOLVED, ERR_CONNECTION_REFUSED, timeout en Madrid); deberían reintentarse, no cancelarse.

4. **El monitor del servidor cuenta mal.**
   - `facylf-monitor` no recibe `FACYLF_TEMPORADA_MINIMA`, así que usa 2023-24 y no ve el histórico.
   - Por eso Rioja salía «sin-trabajo» y las «nueve pequeñas» parecían casi terminadas.
   - Lo que les queda en realidad (trabajos vencidos, aprox.):
     - Aragón ~60.000, Baleares ~58.000, Extremadura ~32.000, Murcia ~31.000;
     - Asturias ~28.000, CLM ~27.000, Cantabria ~17.000, Navarra ~13.000.
   - Los recolectores sí ven 2010-11 (lo pone `docker/.env`) y trabajan bien. Solo falla lo que se muestra.
   - Arreglo: pasar la variable al servicio del monitor en `compose.yml`.

5. **Cataluña (PC) relanza cada ~80 s** (`preparar` + `arrancar`, «Sin trabajo pendiente»). El supervisor cuenta como trabajo los 905 trabajos con fecha futura. No pide a la web, pero gasta CPU y disco del PC.

## Federaciones que «han terminado», contrastadas con lo que publica su portal

Fuente: los sondeos del portal (selector de temporadas y competiciones) del 9-10/09. La herramienta web de Claude no puede abrir los portales: su `robots.txt` cierra `/pnfg/`.

- **Canarias.** El portal solo publica 2021-22 a 2026-27, con unas 10 competiciones por temporada, y la cola está completa. El fútbol canario de verdad está en Las Palmas y Tenerife: 130–220 competiciones por temporada cada una, 11–12 temporadas, sin empezar (contenedores parados).
- **Euskadi.** Completa desde 2014-15 salvo las 762 actas sin leer de 2023-24. Le faltan 2010-11 a 2013-14 (135 competiciones). Bizkaia, Gipuzkoa y Araba, que juntas tienen unas 8 veces más competiciones por temporada, están sin empezar.
- **Ceuta.** Completa. El portal publica desde 2017-18. Las 215 actas vacías de 2017-18 son de sala y base, y el portal no las tiene.
- **Melilla.** Completa desde 2022-23. El selector del portal lista 2012-13 a 2019-20 con 0 competiciones y no lista 2020-21 ni 2021-22: de ese portal no se pueden sacar. Hace falta mirarlo con navegador o buscar otra fuente.
- **Rioja.** El monitor dice «sin trabajo», pero no ha terminado: le queda histórico (2010-11 a 2012-13 con ~1.300 vencidos).

---

## Arreglado el mismo día (código en el PC; despliegue en `ENCARGO-DEEPSEEK-2026-10-11.md`)

- Puntos 1, 2, 4 y 5: carril de la temporada en curso; la jornada se mira la misma noche; `--desde` sigue a `FACYLF_TEMPORADA_MINIMA`; el monitor recibe el suelo; Cataluña ya no se relanza cada 20 s.
- CyL 2012-13, 2013-14 y 2014-15 asignadas (PC 2013-14; servidor 2014-15 y 2012-13).
- Herramientas nuevas: `reabre-cancelados-por-red.mjs` y `trae-federacion-servidor.ps1`.
