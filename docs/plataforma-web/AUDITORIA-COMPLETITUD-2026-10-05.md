# Auditoría de completitud del fútbol federado (05/10/2026)

Pregunta de David: «¿se está scrapeando bien, completo, cada provincia y cada comunidad, para tener los datos de
todos los jugadores?». Respuesta corta: **no del todo, y por tres motivos distintos**. Medido sobre las 19 colas
(16 en el servidor, Valencia/Madrid/Cataluña y las temporadas de CyL del reparto en el PC) con herramientas que
sólo leen:

| herramienta | qué enseña |
|---|---|
| `scripts/claude/auditoria-colas.mjs [fed…]` | por temporada: competiciones, grupos, **grupos sin un solo partido**, partidos, jugados con código de acta, actas hechas/pendientes, trabajos pendientes y **aplazados a 2099**; y reparto por provincia/isla de las dos últimas temporadas |
| `scripts/claude/grupos-vacios.mjs <fed> <temporada>` | por qué está vacío cada grupo (sin índice de jornadas y con trabajo pendiente / sin trabajo / jornadas leídas sin partidos) con ejemplos |
| `scripts/claude/indices-pendientes.mjs <fed…>` | los trabajos `indice_jornadas` pendientes, su prioridad y qué se está sirviendo de verdad |
| `scripts/servidor/verifica-temporada.mjs` | temporada en curso: partidos jugados sin código de acta |

En el servidor: `docker exec -i facylf-monitor sh -c 'cat > /tmp/x.mjs; FACYLF_RAIZ=/app node /tmp/x.mjs …'` con
el guion por la entrada estándar (así se hizo en las peticiones 79, 84 y 87 del enlace).

## 1. Ligas enteras sin leer: el índice de jornadas se quedaba atrás (arreglado en el código)

Un grupo sólo tiene partidos cuando se lee su **índice de jornadas**. Ese trabajo competía con las actas por la
prioridad de su competición, y la cifra de la competición (categoría × 1.000.000) pesa más que la temporada y que
la fase. Así, los grupos de las competiciones «de segunda» (provinciales, base, sala, femenino) esperaban detrás
de las actas de temporadas viejas de las competiciones «de primera». Medido:

| cola | temporada | grupos sin leer / total | ejemplos | pendientes desde |
|---|---|---|---|---|
| CyL (servidor y PC) | 2025-26 | **108 / 301** | 1ª Provincial Juvenil Valladolid G1-3, León, Burgos, El Bierzo; 3ª Prov. Aficionados Valladolid; Cadetes Burgos y Valladolid | 07/09 |
| CyL | 2026-27 | 62 / 236 (servidor) | | 06/09 |
| Andalucía | 2025-26 | **1.001 / 1.856** | 1ª/2ª/3ª Andaluza Sénior de Málaga, 2ª Andaluza Juvenil, femenino, sala | 10/09 |
| Andalucía | 2024-25 · 2023-24 | 1.304 · 1.906 | | 10/09 |
| Galicia | 2024-25 · 2023-24 | 752 · 694 | Tercera Futgal de Pontevedra, Santiago, A Coruña, Ourense | 09/09 |
| Madrid (PC) | 2024-25 · 2023-24 | **1.060 / 1.201 · 1.066 / 1.187** | Primera Aficionado G1-G8… | 11/09 |
| Valencia (PC) | 2025-26 · 2023-24 | 329 · 866 | Segona Cadet/Infantil, futsal | 10/09 |

En las 24 h anteriores el servidor de CyL sirvió 6.667 actas de 2022-23 y 1.462 de 2016-17 mientras 108 grupos
de la temporada pasada seguían sin índice. **Arreglo** (`scripts/recolector-local.mjs` y
`scripts/recolector-valencia.mjs`, que también usa Madrid): `indice_jornadas` va por el carril de descubrimiento,
igual que `grupos`. Es una petición por grupo (CyL ≈ 1.000 en todas sus temporadas; Andalucía ≈ 4.700 de las
temporadas activas). Entra al rearrancar cada recolector, y como mucho en 12 h, que es cuando se reordena el plan
(`reprioritizaPlanSiHaceFalta`). **Hay que desplegarlo en el servidor** (el repositorio del servidor está en
`00383a6`, del 22/09).

Las jornadas de esos grupos siguen después por la prioridad de su competición: llegarán, pero detrás de las actas
de las competiciones de más categoría.

## 2. Federaciones territoriales e insulares que no se recogían (sondeadas hoy)

La Federación Vasca y la Canaria sólo publican en su portal las competiciones **autonómicas**. El grueso (provincial,
base, femenino, sala) está en los portales de las territoriales, que son **la misma plataforma PNFG** que ya leemos.
Sondeo del 05/10 (petición 86, una página cada 8 s):

| portal | temporadas | competiciones 2025-26 | hoy en la cola |
|---|---:|---:|---|
| Bizkaia `webvizcaya.novanet.es` | 22 | 113 | — |
| Gipuzkoa `www.gipuzkoafutbola.eus` | 21 | 147 | — |
| Araba `webalava.novanet.es` | 21 | 75 | — |
| Las Palmas (FIFLP) `www.fiflp.com` | 12 | 132 | — |
| Tenerife (FIFTF) `www.ftf.es` | 11 | 207 | — |
| *(comparación)* Euskadi `euskadifutbol.eus` | 20 | 38 | sí |
| *(comparación)* Canarias `federacioncanariafutbol.es` | 6 | 12 | sí |

Son **≈ 670 competiciones por temporada** que no estaban. Mismo `robots.txt` (`Disallow: /` al agente genérico)
y misma regla que con las 19: cliente identificado, una petición cada 6-8 s. Preparado: `perfiles/{bizkaia,
gipuzkoa,araba,laspalmas,tenerife}.json` y `recolector.<nombre>.config.json` (copias de la de Euskadi). Sondeo completo hecho (peticiones 89-90) y catálogo generado con `bootstrap-federacion.mjs`: **Bizkaia 1.999
competiciones en 21 temporadas (2006-07 → 2026-27), Gipuzkoa 1.955 en 21, Araba 1.138 en 19, Tenerife 1.399 en 10**
(`descargas-<nombre>/competiciones-por-temporada.json`). Las Palmas: el primer sondeo completo no localizó el
módulo; repetido con la ruta fija (petición 91) salió bien: 1.140 competiciones en 11 temporadas. Servicios añadidos a
`docker/compose.yml` (uno por portal, como `euskadi`). Falta: copiar al servidor `perfiles/`, las
`recolector.<nombre>.config.json` y las carpetas `descargas-<nombre>/`, desplegar y arrancar; y el volumen en el
importador cuando el canónico sepa a qué federación pertenecen. Con el suelo de temporadas, por defecto sólo
entran 2023-24 → 2026-27 (ver §3). Para el canónico son fuentes
nuevas que pertenecen a `euskadi` y `canarias`: el importador necesita su entrada (decidir si federación propia o
«delegación» de la autonómica).

## 3. Temporadas históricas aparcadas a propósito (decisión pendiente)

El suelo `TEMPORADA_MINIMA = 2023-24` aplaza a 2099 todo lo anterior salvo lo asignado en
`temporadas-asignadas.txt` (hoy sólo CyL). Con lo que hay en las colas:

| federación | temporadas aparcadas | lo que se tiene de ellas |
|---|---|---|
| Andalucía | 2014-15 → 2022-23 | 0-2.000 partidos por temporada (frente a 55.000 de 2024-25) |
| Aragón, Asturias, Cantabria, CLM, Extremadura, Murcia, Navarra, La Rioja | 2014-15 → 2022-23 | 500-3.000 partidos y la mitad sin acta: son las muestras del principio |
| Baleares | 2014-15 → 2022-23 | **nada** |
| Galicia | 2014-15 → 2022-23 | ~1 % |
| Madrid | 2015-16 → 2022-23 | 0 actas (2021-22 y 2022-23: 9.500 partidos sin acta) |
| Valencia | 2015-16 → 2022-23 | 1.000-7.600 partidos por temporada |

Abrir la historia es añadir esas etiquetas a `temporadas-asignadas.txt` de cada cola (las tres puertas de
`REPARTO-TEMPORADAS.md` ya funcionan con asignación). Coste: del orden de 25.000-55.000 actas por temporada y
federación grande, a 6-8 s cada una y un recolector por federación: **meses**. Recomendación: abrir primero
2022-23 y 2021-22 (son las que dan «años anteriores» a los jugadores de hoy) y dejar el resto detrás.

## 4. Otras cosas vistas

- **Valencia 2024-25 está vacía en el PC**: 981 grupos, 0 partidos. 640 tienen el índice leído pero sin archivo de
  jornada y 312 esperan índice (§1). Con el arreglo del §1 debería moverse; volver a medir en una semana.
- **Madrid 2025-26**: 94.827 partidos y 54.996 actas pendientes en el PC (va a ~2.600 actas/día: ~3 semanas).
- **Galicia 2025-26**: 31.198 actas pendientes en el servidor (~5.600/día: ~6 días).
- **Partidos jugados sin código de acta** (la fuente no la publica o no se lee): Euskadi 45 % en 2025-26, La Rioja
  36 %, Navarra 31 %, Canarias 37 %, Cantabria 12 %. A revisar con una muestra antes de darlo por «no publicado».
- **Las colas del servidor de Valencia, Madrid y Cataluña** están paradas desde el 24/09 (se recogen en el PC);
  sus números no valen para nada y no deben sumarse.
- **El canónico del servidor va muy por detrás de su cola**: en el grupo de 1ª Provincial Juvenil de Salamanca
  tenía J1 (7 actas) cuando la cola tenía J1-J3 (21).

## 5. Traer al PC lo que recoge el servidor (para los informes)

El reparto de temporadas de CyL deja la temporada en curso (2026-27) en el servidor y los informes se hacen en el
PC. Hecho y probado hoy:

1. `scripts/claude/extrae-temporada-cola.mjs <cola> <destino> <temporada> [grupo…]` (servidor, sólo lee): saca la
   temporada a un SQLite nuevo con las mismas tablas, sin `trabajos`. CyL 2026-27: 45 MB, 2.825 actas, 3 s.
2. Se copia al PC por `scp` a `_traspaso\cyl-2026-27.sqlite` (peticiones 81-82).
3. `scripts\importar-temporada.ps1 -Federacion castilla-leon -Temporada 2026-27 -Paquete _traspaso\cyl-2026-27.sqlite`
   importa desde el paquete **sin tocar la cola viva del PC**: el importador lee la cola que diga
   `FACYLF_COLA_CASTILLA_LEON` (`ColaOrigen.rutaDeFederacion`), sólo para esa federación.
4. Todo junto para el informe de Santa Marta B: `scripts\claude\importa-y-genera-santa-marta.ps1` (comprueba que
   Docker conteste, importa el paquete, busca la inscripción en el grupo 24218968 y genera el dashboard con PDF).
   El 05/10 a las 20:45 no se pudo lanzar: **el Docker del PC no contestaba** (`docker ps` colgado más de 60 s,
   Docker Desktop arrancado desde el 02/10).

## 6. Lo que tiene que hacer quien lleva la infraestructura

1. Reiniciar Docker Desktop en el PC y lanzar `scripts\claude\importa-y-genera-santa-marta.ps1`.
2. Desplegar en el servidor `scripts/recolector-local.mjs` (arreglo del §1) y reiniciar sus recolectores; en el PC,
   reiniciar la flota (CyL, Valencia y Madrid usan los dos ficheros tocados).
3. Federaciones nuevas (§2): copiar al servidor `perfiles/{bizkaia,gipuzkoa,araba,laspalmas,tenerife}.json`,
   `recolector.<nombre>.config.json`, `descargas-<nombre>/competiciones-por-temporada.json` y `docker/compose.yml`;
   `docker compose up -d bizkaia gipuzkoa araba laspalmas tenerife`; comprobar en el monitor que piden a 6-8 s.
4. Decidir con David el §3 (historia).
