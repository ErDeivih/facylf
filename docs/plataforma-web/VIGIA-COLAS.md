# Vigía de las colas — qué mira, cómo se lee y qué hacer (22/10/2026)

**Para qué sirve:** enterarse en minutos, y no en días, de que una federación va mal.

En una semana se escaparon tres fallos que «pedían sin errores» y aun así estaban mal. Ninguno daba error; los tres se ven en tres números que nadie miraba:

- **Cataluña** guardaba calendarios con 29 de 30 jornadas vacías: 21.000 partidos de 2025-26 de unos 150.000.
- **La pasada del fin de semana** mandaba las jornadas de 14 federaciones a la web de Castilla y León.
- **El arreglo de Cataluña** guardó 187 calendarios sin fecha, y por eso no encoló ni un acta.

Los tres números: a qué portal se pide, qué parte de lo leído viene vacío y si lo leído deja actas en cola.

## Dónde está y cuándo corre

| Pieza | Qué es |
|---|---|
| `scripts/lib/vigia-colas.mjs` | Las reglas, puras y con pruebas (`node --test scripts/lib/vigia-colas.test.mjs`, 15/15). Aquí están los umbrales (`UMBRALES`) y el reparto PC/servidor (`REPARTO`). |
| `scripts/vigia-colas.mjs` | Mide cada cola. **Sólo lee**: una conexión de lectura y consultas por índice. Tarda ~1 s por federación en el PC y ~2 min en total en el servidor, con `nice 19`. |
| `scripts/claude/enlace-claude.mjs` | Lo lanza en cada pasada (cada 10 min).<br>• En el PC, siempre.<br>• En el servidor, como mucho cada 25 min. Los dos ficheros se le pasan por la entrada estándar al contenedor monitor, así que **no hace falta desplegar nada**. |
| `estado/vigia/` | Lo que deja:<br>• `pc.txt` y `servidor.txt`: el resumen.<br>• `*.json`: las métricas y los avisos.<br>• `*-estado.json`: los avisos vivos.<br>• `alertas.log`: el histórico NUEVO / SIGUE / RESUELTO.<br>Además, `estado/claude/vigia.txt` junta los dos resúmenes. |

**Avisos al móvil:** se usan las mismas variables que `vigilancia-plataforma.mjs`: `ALERTAS_TELEGRAM_TOKEN` con `ALERTAS_TELEGRAM_CHAT`, `ALERTAS_NTFY_URL` o `ALERTAS_WEBHOOK_URL`, en el entorno del PC.

- Sin canal configurado, los avisos sólo quedan en `alertas.log`.
- Se avisa una vez cuando aparece algo, se recuerda cada 6 h mientras siga y se dice una vez cuando se resuelve.

## Las reglas

| Código | Nivel | Qué significa | Qué hacer |
|---|---|---|---|
| `portal_ajeno` | **crítico** | En las últimas 6 h se ha pedido a la web de OTRA federación. | Mirar quién encoló esas URLs. `scripts/claude/repara-urls-otra-federacion.mjs` las arregla. Desde el 22/10, `recolector-local.mjs` rehace la URL antes de pedir (segunda barrera). |
| `bloqueo` | **crítico** | 403 o 429 en la última hora, o una pausa por bloqueo. | No rodearlo nunca. Ver el motivo en la pausa y decide David. |
| `disco` | **crítico** | Menos de 5 GB libres. | Liberar espacio antes de que se corrompa una cola. |
| `parada` | aviso | Hay trabajo vencido, no hay pausa y lleva >90 min sin pedir (>10 h en el servidor, donde las plazas van por turnos). | Mirar el registro del worker y del supervisor. Se tolera media hora tras despertar el PC. |
| `errores` | aviso | ≥10 errores NUESTROS en 1 h y ≥30 % de lo pedido. Los de la fuente («viene vacía», «no publica», «aún no») no cuentan. | Leer el error más repetido que trae el aviso. |
| `lecturas_vacias` | aviso | >25 % de las jornadas YA JUGADAS leídas en 24 h vienen sin partidos, en grupos que sí tienen partidos en otras jornadas. | Lector roto o web cambiada: es el caso de Cataluña. |
| `sin_actas` | aviso | >80 % de las jornadas jugadas con partidos con código no dejan ni un acta en cola. | Partidos sin fecha o sin código: es el caso de la fecha de Cataluña. |
| `calendarios_incompletos` | aviso | >20 % de los calendarios de Cataluña rechazados por incompletos. | Ver `diagnostica-calendario-cataluna.mjs`. |
| `calidad_actas` | aviso | En una temporada, la parte de actas sin alineaciones o ilegibles sube >25 puntos frente a su semana, comparando sólo las mismas competiciones. Desde el 22/10 (noche) hace falta que la subida se vea en **al menos dos competiciones**: una sola que sale vacía es la fuente (DH Juvenil en Cataluña, benjamines de CyL 2019-20), y queda como `calidad_una_competicion` (info, en el resumen con «·», sin aviso). Lo mismo para `riqueza_actas`. | ¿Ha cambiado la maqueta de la web? |
| `riqueza_actas` | aviso | De las actas CON alineaciones, la parte con tarjetas, con cambios o con código de jugador cae por debajo de un tercio de la de su semana (si antes era ≥30 %), en las mismas competiciones. Muestra: 400 actas de 24 h y 1.200 de la semana. Añadida el 22/10/2026: Cataluña guardó meses de actas sin tarjetas, cambios ni códigos sin que nada avisara. | ¿Ha cambiado la ficha (iconos, props) y el lector ya no la entiende? |
| `sin_publicar_salto` | aviso | «Aún no publicado» sube >35 puntos frente a su mediana. | Igual que el anterior: el lector cree que no hay nada. |
| `resultados_atrasados` | aviso | >30 % de las jornadas de la temporada en curso jugadas hace 2-9 días siguen sin un solo marcador, en grupos que sí publican marcadores. | Mirar el repaso de jornadas recientes. |
| `ritmo_bajo` | aviso | Las peticiones de 24 h están por debajo del 40 % de su mediana diaria de la semana (25 % en el servidor, donde las plazas van por turnos), con trabajo pendiente. | Turnos, memoria, PC apagado más horas… |
| `pausa_larga` | aviso | Pausa de más de 6 h que no es por bloqueo. | Ver el motivo. |
| `memoria` | aviso | Menos de 2 GB libres. | Si se repite, bajar plazas. |
| `ilegible` | aviso | No se pudo abrir la cola. | Repetir y, si sigue, `PRAGMA integrity_check`. |

## Cómo se lee la tabla

`últ.` es el tiempo desde la última petición. `1h` y `24h` son las peticiones en ese tiempo. `med7d` es la mediana diaria de los 7 días anteriores. `vencido` es el trabajo que ya se puede pedir y `aplaz.` el que espera fecha.

- `vacías24 = a/b`: de b jornadas jugadas leídas en 24 h, a sin partidos.
- `sinActas24 = a/b`: de b jornadas con partidos con código, a sin ningún acta en cola.

## Lo que el vigía encontró el primer día

- **Andalucía:** 300 peticiones a la web de CyL el 21/10, de 12 a 14 h UTC. Fue antes de la reparación; hoy no queda ningún trabajo con esa URL.
- **Euskadi:** 1 petición así, residual.
- **Cataluña 2025-26:** muchas actas de base y nacionales vienen vacías de la FCF (la FCF borra los datos de menores al cerrar la temporada; las nacionales son de la RFEF). Es la fuente, no el lector.
  - `recolector-cataluna-datos.mjs` ahora cierra sin pedirlas las competiciones de temporadas cerradas con ≥20 actas vacías y ninguna con datos (`cierraCompeticionesSinDatosCataluna`).
- **Las Palmas y Gipuzkoa:** ~15 % de las jornadas de la semana pasada sin marcadores en grupos que sí los publican.
  - Se leyeron antes de que se cargaran y el repaso de 4 días ya no las miraba.
  - `repasaJornadasVaciasEnCurso` también las vuelve a pedir: jugadas hace 4-30 días, como mucho una vez cada 3 días.
