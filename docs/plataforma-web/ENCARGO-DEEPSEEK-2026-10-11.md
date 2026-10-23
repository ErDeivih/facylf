# Encargo para DeepSeek — 11/10/2026 (escrito por Claude)

**Objetivo de David:** que todas las federaciones sigan ingestando bien, sin dejar trabajo por hacer y a ritmos cerca del máximo respetuoso. Claude ha dejado el **código** hecho y probado en el PC. Este encargo es el **despliegue, la verificación y los trabajos largos**.

Diagnóstico de partida: `REVISION-INGESTA-2026-10-11.md`.

## Reglas que no cambian

- **Nada de `docker cp` para código.** El código llega al servidor con `scripts\claude\despliega-codigo-servidor.ps1`, porque los contenedores montan `scripts/` y `perfiles/`.
- **Nunca `docker compose up -d` a secas.** Siempre con la lista de servicios y `--no-deps`. Un `up -d` general levanta las territoriales y lo que recoge el PC.
- **El PC es el ordenador personal de David.** No se tocan energía, suspensión ni ajustes del sistema. **No se mueven federaciones de sitio.**
- **El ritmo respetuoso no se toca:** 5–8 s entre peticiones por web, cliente identificado, sin proxies.
- **Medir el ritmo con la tabla `peticiones`** (`scripts/claude/ritmo-peticiones.mjs`). `trabajos.actualizado_en` engaña: `encola()` lo toca en cada arranque aunque no se pida nada.
- No hay commits si David no los pide.

## Lo que Claude ya ha cambiado (en el repositorio del PC)

| Fichero | Cambio | Para qué |
|---|---|---|
| `scripts/recolector-local.mjs` | Carril `CARRIL_EN_CURSO` (−1.500 M): todo el trabajo de la temporada en curso va antes que el histórico. | Que la jornada de cada fin de semana entre la primera. Cuando no queda nada vencido de la actual, el recolector vuelve solo al histórico. |
| (mismo) | `VERSION_PRIORIDADES` en la huella del plan. | Fuerza a repriorizar la cola en el primer arranque tras desplegar y cada vez que cambie la temporada (julio). |
| (mismo) | La jornada se mira **la misma noche** del partido (21:00 UTC), no a las 06:00 del día siguiente. | Los resultados del domingo entran el domingo. Lo que aún no esté publicado lo vuelve a pedir el repaso de jornadas recientes (18 h). |
| (mismo) | `--desde` por defecto = año de `FACYLF_TEMPORADA_MINIMA` (2010), no 2015. | Entran en la cola las temporadas 2010-11 a 2014-15 que las webs publican y nunca se encolaron: unas 1.960 competiciones. |
| `scripts/recolector-valencia.mjs` (Madrid y Valencia) | El mismo carril y la misma hora de la jornada. | Lo mismo para iSquad. |
| `scripts/contar-pendientes.mjs` | Cuenta solo los trabajos **vencidos**. | Cataluña (PC) se relanzaba cada 20 s día y noche por 905 trabajos con fecha futura. |
| `docker/monitor.yml` | `FACYLF_TEMPORADA_MINIMA` (2010-11) y `andalucia` en `FACYLF_EXCLUIR`. | El monitor no veía el histórico (Rioja salía «sin-trabajo») y seguía vigilando Andalucía, que ya está en el PC. |
| `docker/compose.yml`, `docker/web.yml` | Valores por defecto: suelo 2010-11 y `andalucia` en `FACYLF_EXCLUIR`. | Que coincidan con `.env` aunque falte la línea. |
| `descargas-federacion/recolector-local/temporadas-asignadas.txt` (PC) | + `2013-14`. | CyL 2012-13 a 2014-15 no las tenía nadie. |
| `scripts/servidor/temporadas-asignadas-servidor.txt` | + `2014-15`, `2012-13`. | Lo mismo, en el servidor (alternando). |
| `scripts/claude/reabre-cancelados-por-red.mjs` (nuevo) | Reabre trabajos cancelados solo por un fallo de red. | ~40 actas en el servidor y 33 en Madrid. |
| `scripts/claude/trae-federacion-servidor.ps1` + `lista-temporadas-cola.mjs` (nuevos) | Traen al canónico del PC cualquier federación del servidor, temporada a temporada. | La regla de David: toda la información en un mismo sitio. |
| `scripts/claude/estado-colas.mjs`, `ritmo-peticiones.mjs`, `que-sirve.mjs`, `actas-canceladas.mjs`, `competiciones-por-temporada.mjs` (nuevos, solo leen) | Herramientas de medida. | Para verificar cada paso. |

Pruebas hechas:
- `node --check` en todo.
- El orden de prioridades, probado sobre las funciones reales:
  1. catálogo;
  2. temporada en curso (acta, jornada, índice);
  3. descubrimiento del histórico;
  4. actas del histórico.
- El cambio de temporada en julio (junio 2027 → 22, julio 2027 → 23).
- `compose-flota.test.mjs` pasa 6/6.

## PASO 1 — Desplegar en el servidor (hoy)

Desde el PC, en `F:\EspacioCodigo\facylf`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1
scp docker\compose.yml docker\monitor.yml docker\web.yml servidor:/srv/data/facylf/docker/
scp scripts\servidor\temporadas-asignadas-servidor.txt servidor:/tmp/ta.txt
```

En el servidor (`ssh servidor`), en `/srv/data/facylf`:

```bash
D=descargas-federacion/recolector-local
cp $D/temporadas-asignadas.txt $D/temporadas-asignadas.txt.antes-20261011
cp /tmp/ta.txt $D/temporadas-asignadas.txt
grep -E 'TEMPORADA_MINIMA|EXCLUIR' docker/.env   # suelo 2010-11; si .env define EXCLUIR, añadirle andalucia
bash scripts/servidor/recrea-monitor.sh          # el monitor necesita recrearse para ver las variables nuevas
C="docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml"
F="aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
docker exec facylf-galicia-1 printenv FACYLF_DIR_PERFILES_CHROME   # ¿perfiles de Chrome en el SSD?
#   vacío  -> $C up -d --no-deps $F   (recrea SOLO esas; aplica perfiles en SSD + código)
#   con valor -> $C restart $F        (basta reiniciar para el código)
```

En el PC no hay que desplegar nada: el código ya está ahí, y cada tanda arranca un proceso nuevo. Para que entre ya:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-flota.ps1
```

## PASO 1b — Reiniciar OTRA VEZ la flota del PC (añadido a las 17:30 del 11/10)

- Claude encontró, revisando el paso 1, que el supervisor único del PC (`supervisor-flota.mjs`) **no pasaba `FACYLF_TEMPORADA_MINIMA` a sus hijos**.
- Por eso todos los recolectores del PC trabajaban con el 2023-24 por defecto. El registro de Andalucía decía «Plan local preparado: **4** temporadas y 3288 competiciones», y Madrid esperaba «planificador: 1978 s» sin trabajo, con unos 40.000 trabajos de histórico en su cola.
- El histórico de Andalucía (~150.000), Madrid y Valencia no se pedía en el PC.
- Arreglado en `scripts/lib/configuracion-flota.mjs` y `scripts/lib/plan-flota.mjs`, con una prueba nueva (`plan-flota.test.mjs`, 13/13).
- El supervisor tiene el código viejo cargado, así que hay que reiniciarlo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-flota.ps1
```

Comprobación a los 15–30 min:
- en `descargas-andalucia\recolector-local\worker-programado.log`, «Plan local preparado: **14** temporadas» (o más), no 4;
- en `descargas-federacion\...`, más de 9;
- Madrid deja de esperar «planificador: NNNN s» y vuelve a pedir.

## PASO 1c — Un tercer suelo: volver a desplegar el código en el servidor (añadido a las 18:00 del 11/10)

- Tras el 1b, Andalucía preparaba 13 temporadas y 8.850 competiciones. Su catálogo tiene **14** y **9.269**: la diferencia, exactamente, es la 2013-14 (419 competiciones).
- Causa: `numero('desde')` lee primero `alcance.desdeAnio` de `recolector.<fed>.config.json`. Vale 2014 en casi todas, y 2015 en CyL, Madrid, Valencia, Cataluña y Melilla.
- En el servidor esos ficheros están dentro de la imagen. Se ha arreglado en `scripts/recolector-local.mjs` (`anioDesdePlan`): salvo un `--desde` explícito, el plan empieza en el menor de los dos años (el del fichero y el del suelo acordado). Rioja (2008) conserva el suyo.
- **En el PC no hay que hacer nada**: entra en la siguiente tanda de cada recolector.
- **En el servidor**, repetir el despliegue del código y reiniciar las federaciones afectadas:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1
```
```bash
$C restart aragon castilla-la-mancha euskadi extremadura asturias navarra federacion
```

Comprobación:
- en el PC, Andalucía «Plan local preparado: **14** temporadas y **9.269** competiciones»;
- en el servidor, `competiciones-por-temporada.mjs aragon castilla-la-mancha euskadi extremadura asturias navarra` debe empezar a mostrar `13-14`, `12-13`, `11-12` y `10-11`, donde las tenga su catálogo.

## PASO 2 — Verificar (1–2 h después). Si algo no sale, parar y avisar a Claude

1. **La temporada en curso va primero.**
   ```bash
   docker exec facylf-galicia-1 node --no-warnings /app/scripts/claude/que-sirve.mjs /app/descargas-galicia/recolector-local/cola-v2.sqlite 1
   ```
   - «prioridad mínima vencida: 2026-27» debe salir **negativa (≈ −1.400.000.000)** o `null` si ya no queda nada de la actual.
   - «vencido ahora (2026-27)» debe bajar hacia 0.
   - Mismo control en `federacion`, `aragon` y, en el PC, `andalucia`, `madrid`.
   - En el registro de cada recolector, al arrancar, debe aparecer «trabajos ordenados».
2. **Entran las temporadas históricas nuevas.**
   ```bash
   docker exec -e FACYLF_RAIZ=/app facylf-monitor node --no-warnings /app/scripts/claude/competiciones-por-temporada.mjs aragon castilla-la-mancha extremadura euskadi asturias navarra federacion
   ```
   - Deben aparecer `13-14`, `12-13`, `11-12` y `10-11` donde el catálogo las tiene. Al principio con 0 competiciones: las llena `catalogo_temporada` / `grupos`.
   - En el PC (`FACYLF_RAIZ` = la raíz del repositorio): `andalucia` 2013-14 y `federacion` 2013-14.
3. **El monitor cuenta bien.** `docker logs --tail 40 facylf-monitor`: Rioja, Aragón y las demás deben salir «trabajando» con decenas de miles de pendientes. Andalucía ya no debe salir.
4. **Cataluña quieta.** En el PC, `descargas-cataluna\recolector-local\worker-programado.log` debe decir «siguiente intento en 1800 s (sin trabajos pendientes)», no «20 s».
5. **Ritmo.**
   ```bash
   docker exec -e FACYLF_RAIZ=/app facylf-monitor node --no-warnings /app/scripts/claude/ritmo-peticiones.mjs $F
   ```
   - Referencia de hoy: 4.500–7.400 peticiones cada 24 h por federación activa.
   - No debe bajar. Si sube la proporción de `error`/`bloqueo`, parar y avisar.

## PASO 3 — Reabrir lo cancelado por la red (después del paso 2)

Primero contar (sin `--aplicar`), luego aplicar. En el servidor, por federación:

```bash
for f in aragon asturias baleares cantabria castilla-la-mancha extremadura federacion galicia melilla murcia navarra; do
  docker exec facylf-$f-1 node --no-warnings /app/scripts/claude/reabre-cancelados-por-red.mjs /app/descargas-$f/recolector-local/cola-v2.sqlite
done
# revisar los números y repetir con --aplicar al final de la línea
```

En el PC, lo mismo para `madrid`, `valencia`, `andalucia` y `federacion`, sobre `descargas-<f>\recolector-local\cola-v2.sqlite`.

## PASO 4 — Toda la información en el PC (trabajo largo; después, rutina semanal)

```powershell
# prueba con UNA temporada sin importar:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-federacion-servidor.ps1 -Federacion rioja -Temporadas 2025-26 -SoloTraer
# si llega el paquete, de verdad, una federación cada vez:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-federacion-servidor.ps1 -Federacion rioja -Todas
```

- **Orden:** las pequeñas primero (rioja, ceuta, melilla, canarias, euskadi, navarra, cantabria) para validar; luego las grandes (galicia, aragon, baleares…).
- **CyL:** `-Federacion castilla-leon` con sus temporadas del servidor.
- **Rutina:** una vez por semana, todas. CyL y la temporada en curso, dos veces.
- Docker Desktop tiene que estar arriba y sin otra importación en marcha.
- Si `importar-temporada.ps1` falla en un grupo, guardar la salida y seguir con el siguiente.

## PASO 5 — Las cinco federaciones territoriales (lo más grande que falta)

Bizkaia, Gipuzkoa, Araba, Las Palmas y Tenerife:
- son 130–220 competiciones por temporada cada una; la web publica desde 2005-06 (Bizkaia) o 2006-07 (Gipuzkoa, Araba), 2015-16 (Las Palmas) y 2016-17 (Tenerife), y con el suelo de 2010-11 se recoge desde ahí;
- las provinciales vascas y las insulares canarias, que Euskadi y Canarias no publican;
- perfil, configuración y catálogo están listos desde el 05/10; los contenedores están parados.

1. Solo después de los pasos 1–2, y con el servidor estable: carga media de 15 min por debajo de ~40 y sin caídas en 24 h.
2. **Una cada día**, empezando por **bizkaia**:
   ```bash
   $C --profile territoriales up -d --no-deps bizkaia
   ```
3. Comprobar que `docker/compose-turnos.yml` la incluye. Si no, regenerarlo con `scripts/servidor/calcula-turnos.mjs`. El servidor no tiene Node: dentro de un contenedor `node:22-alpine` con el repositorio montado, o en el PC, y copiarlo.
4. A las 24 h: `ritmo-peticiones.mjs bizkaia` sin bloqueos y con ritmo. Luego gipuzkoa, araba, tenerife y laspalmas, una por día.
5. **Importación al canónico:** el código de federación es el nombre de la carpeta (`bizkaia`, …).
   - Probar primero con `importar-temporada.ps1 -Federacion bizkaia -Temporada 2025-26 -SoloListar` y después un grupo.
   - Si el canónico rechaza la federación (tabla o restricción), parar y pasar el error a Claude.

## PASO 6 — Valencia (bloqueada por `INVALID_PAGE_TOKEN`)

- Diagnóstico en `FEDERACIONES-CON-PROBLEMAS-2026-10-08.md` §3: el `fetch` a `/competiciones/api/filtros/*.php` va sin `Referer`, sin cookies y sin el token de página.
- Hacer **una** petición de prueba, a mano, fuera del recolector:
  1. pedir la página del portal que usa ese filtro;
  2. sacar el token (campo oculto o variable JS);
  3. repetir la llamada a la API con `Referer`, la cookie de esa visita y el token.
- Solo si contesta 200 con datos, llevarlo a `recolector-valencia.mjs` (renovando el token por sesión o al recibir `INVALID_PAGE_TOKEN`).
- Hay que respetar la pausa global que pone el propio recolector.
- Queda por recoger: 2024-25 y 2020-21 sin ningún partido, y ~43.500 trabajos vencidos.

## PASO 7 — Melilla (2015-16 a 2021-22)

- El selector del portal de la RFMF lista 2012-13 a 2019-20 con 0 competiciones y no ofrece 2020-21 ni 2021-22.
- Mirarlo con un navegador de verdad: ¿hay competiciones si se entra por otro camino (otro `cod_primaria`, menú de resultados, PDFs)?
- Anotar lo que haya. Si no publica nada, se da por cerrada.

## PASO 8 — Ritmo cerca del máximo respetuoso

- El tope por web es de 450–720 peticiones/h (5–8 s). Hoy van 190–385/h: lo limita el servidor (4 núcleos, disco lento), no las webs.
- Con perfiles en SSD (paso 1) y las pequeñas acabando su histórico, el ritmo de las grandes sube solo.
- **No bajar `FACYLF_MEMORIA_GB`** salvo que la presión de memoria «full» de `/proc/pressure/memory` pase de ~5 % sostenido.
- Medir antes y después con `ritmo-peticiones.mjs`.
- En el PC, subir `FACYLF_MEMORIA_GB` (4,5 → 6) **solo si David lo aprueba**, y solo con más de 7 GB libres de forma estable.

## Qué queda fuera, porque la fuente no lo publica

- Cataluña antes de 2025-26: la API de la FCF solo publica dos temporadas.
- Canarias regional antes de 2021-22; Ceuta antes de 2017-18.
- Actas «ilegibles» de Navarra (2.019), Euskadi (762), Rioja (60) y CLM (11): **no son un fallo del lector**. Comprobado el 11/10 con 9 muestras: la federación publica la ficha con marcador y árbitro pero **sin alineaciones** («Titulares» vacío, entrenador «No presenta»). Ya se marcan como `sin_datos`, y no se vuelven a pedir.
- Rioja 2008-09 y 2009-10: por debajo del suelo de 2010-11, no se sirven (decisión de David si se quieren).
