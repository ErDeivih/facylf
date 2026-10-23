# Reparto PC / servidor y cuánto le queda a CyL (09/10/2026)

## Lo que se midió (peticiones 107 y 108, `scripts/claude/por-que-aplazados.mjs`, sólo lee)

**Corrección importante**: se dijo que de los pendientes de CyL «44.754 están aplazados» y que CyL «está
prácticamente al día, esperando a que la federación publique». **No es así.** Cada máquina sólo sirve sus
temporadas (`temporadas-asignadas.txt`), así que hay que contar cada una con las suyas:

| máquina | temporadas que sirve | vencidos (se pueden hacer ya) | aplazados de verdad |
|---|---|---:|---|
| servidor | 2026-27, 2024-25, 2022-23, 2020-21, 2018-19, 2016-17 | **15.288** (621 de 2026-27 + 14.667 de historia) | 5.469: jornadas futuras de 2026-27, hasta mayo de 2027 |
| PC | 2025-26, 2023-24, 2021-22, 2019-20, 2017-18, 2015-16 | **31.783** | ~140 reintentos de esta semana |

Lo aplazado de verdad es sólo la temporada en curso (eso sí es esperar a la federación). La historia está por hacer
y espera turno de máquina, no de calendario. (Cada cola tiene también filas de las temporadas de la otra máquina;
no cuentan: no las sirve.)

Servido en 24 h (CyL): servidor 4.748 actas + ~1.000 de descubrimiento; PC 3.084 actas + ~470 (el PC estuvo
suspendido parte del día).

## Cuánto le queda a CyL, con estos ritmos

Hoy hay **~47.000 trabajos vencidos** entre las dos máquinas, pero no es el total: muchos son páginas de jornada
que, al leerse, crean los trabajos de sus actas. La cuenta hay que hacerla por actas: una
temporada reciente completa de CyL son ~24.000-28.000 actas (2024-25: 27.917); comparando con lo recogido, faltan
**hasta ~95.000 actas** (2017-18 y 2015-16 son las más vacías, ~19.000 cada una), menos las que la federación no
publique de esos años (ya hay ~1.700 «actas que la fuente no sirve» en temporadas viejas).

A ~9.300 trabajos/día entre las dos máquinas (5.800 servidor + 3.500 PC con sus suspensiones): **entre 1 y 3
semanas** para tener CyL 2015-16 → 2025-26 completa: una si las temporadas viejas tienen menos actas publicadas,
tres si tienen tantas como las recientes. La herramienta para saberlo sin estimar es `cierre-temporada.mjs`
(semanal). Lo que lo acortaría: que el PC no se suspenda (rinde ~40 % más) y que el servidor deje de esperar al
disco (CAIDAS-SERVIDOR-2026-10-09.md). La 2026-27 se va completando sola cada semana.

## Qué federaciones al PC

Lo que importa para elegir es el **trabajo que queda**, no el % de CPU de un momento:

| federación (servidor) | pendientes vencidos | servido en 24 h |
|---|---:|---|
| Andalucía | ~184.000 (13 temporadas) | 7.816 grupos, 4.778 índices, 899 actas |
| Galicia | ~170.000 | 5.439 índices, 2.093 grupos, 574 actas |
| CyL (servidor) | ~38.000 | 4.748 actas |

Asturias, que se propuso por su CPU, tiene ~2.700 pendientes: moverla no cambia nada.

Decisión: **Andalucía al PC primero**; **Galicia** después, si el PC aguanta 24-48 h. El PC tiene 12 núcleos pero sólo
**3 GB libres de 32** (python 2,6 GB, DeepSeek Harness 2,1 GB, Brave ~3,7 GB, ChatGPT, WSL…): cada recolector con
Chrome son ~0,7-1 GB. Con Andalucía cabe; para Galicia conviene cerrar algo. CyL sigue repartida por temporadas
alternas entre las dos máquinas (`temporadas-asignadas.txt`), como pidió David.

## Cómo se traspasa

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\traspasa-federaciones-al-pc.ps1 -Federaciones andalucia`
(primero sin `-Aplicar`: enseña el plan y no toca nada). Con `-Aplicar`: para el contenedor en el servidor, empaqueta
su cola VIVA (la copia que tiene el PC es de septiembre: arrancar con ella repetiría semanas de actas), la trae y
comprueba la huella, la instala apartando la vieja como `*.antes-<fecha>`, la quita de `FACYLF_EXCLUIR`, copia al
servidor el `docker/compose.yml` (Andalucía ya lleva `profiles: ["recoge-en-pc"]`) y reinicia la flota del PC.

## 09/10 11:15 — `traspasa-federaciones-al-pc.ps1` arreglado para PowerShell 5.1

- Fallo que vio DeepSeek (`ParameterAlreadyBound` 'orden'): la función se llamaba `Ssh` y en PS 5.1 una función tapa al ejecutable del mismo nombre sin distinguir mayúsculas, así que `& ssh` dentro de ella se llamaba a sí misma. Ahora es `EnServidor`, y todos los externos van como `ssh.exe`, `scp.exe`, `tar.exe`, `node.exe` y `powershell.exe` a través de `Nativo`.
- `Nativo` también evita el segundo tropiezo que venía después. Con `ErrorActionPreference=Stop`, el progreso de `docker compose stop` por stderr habría abortado el paso 1 con NativeCommandError. Ahora se decide por el código de salida, y cada scp/tar comprueba el suyo (antes no se miraba).
- Paso 2: si el servidor no devuelve una huella sha256 válida, el guion para antes de copiar.
- Plan verificado por el enlace (petición 109), sin `-Aplicar`: llega al final con código 0. Estado medido:
  - Andalucía: PC 12.407 actas hechas, servidor en marcha.
  - Galicia: PC 22.552 actas hechas, servidor en marcha.
- Siguiente paso, a mano: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\traspasa-federaciones-al-pc.ps1 -Federaciones andalucia -Aplicar`.
- Galicia va 1–2 días después, si el PC sigue con memoria (hoy tiene 4,5 GB libres).

## 09/10 18:15 — Andalucía ya en el PC; memoria del servidor medida (peticiones 111–113)

**Traspaso de Andalucía.** En el servidor, `facylf-andalucia-1` está parado (Exited 0) y no vuelve con un `up -d`. En el PC, la cola tiene 225.000 trabajos pendientes; ~208.000 ya se pueden pedir y ~16.600 son jornadas futuras de 2026-27. Hay trabajo para semanas, no «7 vencidos».

**Cataluña sin peticiones es lo esperado.** La API de la FCF sólo publica 2025-26 y 2026-27 (FEDERACIONES-CON-PROBLEMAS-2026-10-08). La 2025-26 está hecha. De la 2026-27 quedan 904 trabajos que vencen más adelante. 191 calendarios de 2026-27 (promociones sin sortear) acumularon ~51.500 intentos (hasta 506 cada uno); ya están aplazados hasta el 31/03/2027. Habría que poner un tope de intentos para que no se repita en primavera.

**Memoria del servidor: NO bajar el tope por contenedor a 600 MB.**
- Que los topes sumen 31 GiB con un slice de 12 GiB es normal: un tope es un máximo, no una reserva.
- El slice está lleno así:
  - 5,3 GiB son memoria de programas;
  - 5,0 GiB son caché de disco que el núcleo puede soltar;
  - 1,0 GiB es del núcleo;
  - 0 OOM.
- Los contenedores con navegador usan 0,7–1,0 GiB de memoria propia (aragon, castilla-la-mancha, cantabria, rioja: 1,0–1,3 GiB con caché). Con un tope de 600 MB, el núcleo mataría el navegador o lo ahogaría.
- Lo que sí se mide:
  - presión de memoria 28–37 % (some), por la caché expulsada y releída: 472 M refaults de fichero;
  - presión de disco 82–87 %;
  - presión de CPU 86–89 % en 4 núcleos.
- Lo que lo ataca son los tres pasos pendientes:
  - perfiles de Chrome al SSD, porque las relecturas dejan de ir al disco de 5.400 rpm;
  - `FACYLF_MEMORIA_GB=6.5`, porque menos navegadores dejan más memoria y CPU;
  - `systemd-oomd`.
- Y seguir pasando federaciones al PC.

**PC.** La memoria libre baila entre 3,4 y 8,2 GB según lo que tenga abierto David. La flota del PC reparte `FACYLF_MEMORIA_GB=4.5` (unas 4 plazas de navegador) entre todas sus federaciones. Galicia, al llegar, comparte esas plazas con CyL, Madrid y Andalucía: o se sube el presupuesto (p. ej. a 6 GB, si la memoria libre lo permite), o el PC no recoge más; sólo lo reparte distinto.
