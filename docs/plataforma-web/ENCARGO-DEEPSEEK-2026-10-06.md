# Encargo para DeepSeek (06/10/2026)

De Claude, a petición de David. Contexto completo: `docs/plataforma-web/AUDITORIA-COMPLETITUD-2026-10-05.md`.
Orden de prioridad: 0 → 1 → 2 → 3. Cada paso dice cómo se comprueba; **no se da por hecho sin la comprobación**.

## 0. El motor de Docker del PC está colgado (aunque Docker Desktop se vea arriba)

Medido el 06/10 a las 12:54 desde el usuario `david`, sesión 1 (petición 92 del enlace):

- `docker context ls` contesta (es local), pero **`docker version` y `docker ps` no contestan en 30 s**.
- El puerto `127.0.0.1:5433` **acepta la conexión TCP**, pero Postgres **no responde** (`pg` da `timeout expired`).
- Lo mismo desde las 17:24 del 05/10 (peticiones 78, 83, 91b). Docker Desktop lleva arrancado desde el 02/10 11:08.

Es decir: la ventana de Docker Desktop y el reenvío de puertos están vivos, la máquina WSL que hay debajo no.

Arreglo propuesto (sin tocar datos):
1. Parar lo que escribe en el canónico del PC, si hay algo (importador masivo).
2. Docker Desktop → *Troubleshoot* → *Restart Docker Desktop*. Si sigue igual: salir de Docker Desktop,
   `wsl --shutdown`, esperar 10 s y volver a abrir Docker Desktop.
3. Antes de nada más, mirar espacio libre en `C:` y `D:` (el `docker_data.vhdx` vive en `D:\DockerData\wsl\disk`,
   ver `scripts/arregla-docker-pc.ps1`); un disco lleno deja el motor exactamente así.

**Comprobación**: `docker version` contesta en < 5 s y
`docker exec facylf-postgres psql -U facylf_admin -d facylf -X -c "select count(*) from core.match"` da un número.

## 1. Informe de U.D. Santa Marta de Tormes «B» juvenil (lo pidió David)

1ª Provincial Juvenil de Salamanca, grupo `24218968`, temporada 2026-27, que **recoge el servidor**. El paquete
con la temporada entera de CyL ya está en el PC: `_traspaso\cyl-2026-27.sqlite` (sacado el 05/10 a las 19:40,
2.825 actas, incluye J1-J3 del grupo).

Con Docker funcionando:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\importa-y-genera-santa-marta.ps1

Importa la temporada desde el paquete (no toca la cola viva del PC: usa `FACYLF_COLA_CASTILLA_LEON`, ver
`ColaOrigen.rutaDeFederacion`), busca la inscripción y genera `informes/…santa-marta…` y el PDF en `output/pdf/`.

**Para refrescar el paquete** con lo último del servidor (p. ej. tras la jornada del fin de semana), repetir las
peticiones 81 y 82 del enlace (`estado/claude/peticiones/hechas/*-81-extrae-cyl-2026-27-servidor.sh` y
`*-82-recibe-cyl-2026-27-pc.ps1`): extraen en el servidor con `scripts/claude/extrae-temporada-cola.mjs` y lo
copian por `scp`.

**Comprobación**: el informe enseña las tres jornadas (2-1 a Peñaranda, 0-4 en Navega B, 1-4 contra Unionistas
C). Avisar a Claude para que revise el informe.

## 2. Desplegar el arreglo del índice de jornadas

Cambio en `scripts/recolector-local.mjs` y `scripts/recolector-valencia.mjs` (función `prioridadDesdeNombres`):
`indice_jornadas` pasa al carril de descubrimiento, como `grupos`. Motivo y cifras en la auditoría §1 (CyL 2025-26
con 108 de 301 grupos sin leer desde el 07/09; Andalucía 1.001; Madrid 2024-25 1.060…).

1. Servidor: llevar los dos ficheros (el repo del servidor está en `00383a6`, 22/09; usar el despliegue de
   siempre) y reiniciar los recolectores PNFG. PC: reiniciar la flota (CyL, Valencia y Madrid).
2. El orden nuevo se aplica cuando el recolector reordena el plan: en el arranque si el catálogo cambió o han
   pasado 12 h (`reprioritizaPlanSiHaceFalta`). Si se quiere al momento, `FACYLF_HORAS_REPRIORIZAR=0` en un
   arranque.

**Comprobación** a las 24 h: `scripts/claude/indices-pendientes.mjs` (en el servidor por la entrada estándar del
contenedor `facylf-monitor`, como la petición 87) — los `índices … pendiente` de 2023-24 a 2026-27 tienen que bajar
mucho y aparecer `indice_jornadas` en «servidos en 24 h». Y `scripts/claude/grupos-vacios.mjs federacion 2025-26`
debe bajar de 108.

## 3. Cinco federaciones territoriales/insulares nuevas

La Vasca y la Canaria sólo publican lo autonómico; el resto está en PNFG propios, sondeados el 05/10:

| nombre | portal | catálogo |
|---|---|---|
| `bizkaia` | webvizcaya.novanet.es | 1.999 competiciones, 21 temporadas |
| `gipuzkoa` | www.gipuzkoafutbola.eus | 1.955, 21 |
| `araba` | webalava.novanet.es | 1.138, 19 |
| `laspalmas` | www.fiflp.com | 1.140, 11 |
| `tenerife` | www.ftf.es | 1.399, 10 |

Ya preparado en el PC: `perfiles/<nombre>.json`, `recolector.<nombre>.config.json` (copia de la de Euskadi:
6-8 s, menores sí), `descargas-<nombre>/competiciones-por-temporada.json` y un servicio por nombre en
`docker/compose.yml` (igual que `euskadi`).

1. Copiar al servidor esos ficheros y carpetas y el `docker/compose.yml`.
2. `docker compose up -d bizkaia gipuzkoa araba laspalmas tenerife` (con el `-f` de siempre).
3. Plazas: cinco recolectores más. Si el gobernador de plazas no da para todos, que entren por turnos; no subir
   el ritmo por sitio (cada portal es un dominio distinto, así que no se pisan entre ellos).
4. Importador: hoy no los conoce (`fuenteDeFederacion` exige una entrada en `config/federaciones-espana.json` y una
   fila en `core.federation`). Propuesta: una entrada por portal con su código y un campo `pertenece_a`
   (`euskadi` / `canarias`), y su volumen en `docker/importador.yml`. **Decidirlo con David antes de migrar.**
   Mientras tanto se recoge igual; la cola no depende del canónico.

**Comprobación**: en el monitor del servidor aparecen las cinco, `pidiendo > 0`, sin fallos, ~6-8 s entre
peticiones; en 24 h `scripts/claude/auditoria-colas.mjs bizkaia gipuzkoa araba laspalmas tenerife` enseña
grupos y partidos de 2026-27 a 2023-24.

## 4. Pendiente de decisión de David (no hacer sin su sí)

- **Historia anterior a 2023-24** (auditoría §3): está aparcada en 14 federaciones. Propuesta: abrir primero 2022-23
  y 2021-22 añadiéndolas a `temporadas-asignadas.txt` de cada cola. Ojo: el fichero sustituye al suelo, así que hay
  que listar TODAS las temporadas que se quieren (las actuales también).

## 5. Seguimiento semanal (lunes, después de la pasada del fin de semana)

    auditoria-colas.mjs          → grupos vacíos y actas pendientes por temporada y provincia
    verifica-temporada.mjs        → partidos jugados sin código de acta en la temporada en curso

Cosas a vigilar ya identificadas: Valencia 2024-25 vacía en el PC (981 grupos, 0 partidos); Madrid 2025-26 con
~55.000 actas pendientes; Euskadi, Canarias, La Rioja y Navarra con un 31-45 % de partidos sin código de acta.

Dejar el resultado de cada paso en `estado/` o en un documento, para que Claude lo lea por el enlace.

## 6. (añadido el 06/10 por la noche) Cierre de temporada

Nueva herramienta `scripts/claude/cierre-temporada.mjs` y regla en `docs/plataforma-web/CIERRE-DE-TEMPORADA.md`:
una temporada sólo se da por cerrada con veredicto CERRADA (o CERRADA CON RESERVAS revisadas en la web). Hoy
ninguna lo está. Tareas:

1. Cuando el servidor vuelva a contestar (a las 23:44 el SSH a 192.168.1.139 daba *timeout*), la petición 97 del
   enlace mide las 16 colas; si no se ejecuta sola, lanzarla a mano.
2. Con el Docker del PC levantado (a las 23:44 el motor ni existía: `dockerDesktopLinuxEngine` no encontrado),
   `cierre-temporada.mjs federacion --canonico` en el PC: dice qué grupos tiene la cola y no el canónico.
3. Añadirlo a la vuelta de los lunes.

## 7. (07/10, 00:25) Corrección: el arreglo del índice NO está en el servidor

Medido en los contenedores: `/app/scripts/recolector-local.mjs` es del 23/09 (andalucia, galicia) y del 29/09
(federacion) y no contiene `(tipo === 'grupos' || tipo === 'indice_jornadas') ? CARRIL_DESCUBRIMIENTO`. Lo que se
desplegó fue `scripts/lib/`; el cambio está en el guion principal `scripts/recolector-local.mjs`. Los índices
pendientes del servidor siguen igual que el 05/10 (Andalucía 11.392, Galicia 9.945, CyL 1.039) y con prioridad
positiva. Desplegar ese fichero en los 16 y comprobarlo con:

    docker exec facylf-andalucia-1 grep -c "indice_jornadas') ? CARRIL" /app/scripts/recolector-local.mjs   # → 1

y a las 12 h con `scripts/claude/indices-pendientes.mjs` (la prioridad mínima de los índices tiene que ser negativa).

## 8. (07/10, 10:10) Despliegue de código: decidido montar `scripts/` y `perfiles/`

`docker/compose.yml` monta ahora `../scripts:/app/scripts:ro` y `../perfiles:/app/perfiles:ro` en los 26 servicios
de recolección (y se quitaron los 5 montajes de ficheros sueltos). Motivo y pasos en
`docs/plataforma-web/DESPLIEGUE-CODIGO.md`. Orden obligatorio:

1. `scripts\claude\despliega-codigo-servidor.ps1` (copia `scripts/` y `perfiles/` a `/srv/data/facylf`).
2. Copiar `docker/compose.yml` y recrear los recolectores con `up -d`. **Nunca al revés**: recrear primero monta el
   `scripts/` del 22/09 que hay hoy en el servidor.
3. `despliega-codigo-servidor.ps1 -SoloComprobar` → las cuatro huellas OK.

Desde entonces, desplegar = paso 1 + `restart`. `docker cp` queda prohibido para código.

## 9. (07/10) El canónico del PC va por detrás de su cola

Medido con `cierre-temporada.mjs federacion --canonico` (ver CIERRE-DE-TEMPORADA.md): 2025-26 tiene 16.035 actas en
el canónico frente a 23.318 en la cola; 2021-22, 368 frente a 14.130; 2019-20, 2017-18 y 2015-16, ninguna. Con Docker
ya funcionando: `pnpm importar:todo` (o `importar-temporada.ps1` temporada a temporada, empezando por 2025-26), y
después el informe de Santa Marta B (`scripts\claude\importa-y-genera-santa-marta.ps1`).

## 10. (07/10) Las cinco territoriales sólo arrancan si se nombran

Tienen `profiles: ["territoriales"]` en `docker/compose.yml`: un `docker compose … up -d` del proyecto entero ya no
las levanta. Se arrancan de una en una con `… up -d bizkaia` (nombrar el servicio activa su perfil). Copiar el
compose nuevo al servidor antes del próximo `up -d`. Orden propuesto, una cada 2-3 días si la carga de 1 min se
mantiene por debajo de ~12: tenerife (la mayor, 207 competiciones/temporada), gipuzkoa, bizkaia, laspalmas, araba.

## 11. (07/10) Después de `importar:todo`: traer las temporadas de CyL que recoge el servidor

`importar:todo` importa lo que hay en las colas **del PC**. Las temporadas de CyL que recoge el servidor (2026-27,
2024-25, 2022-23, 2020-21, 2018-19, 2016-17) están en el PC sólo como quedaron antes del reparto (2024-25: ~6.000
actas en el PC frente a ~26.000 en el servidor). Un informe que mire «temporadas anteriores» las vería a medias.
Cuando termine la importación:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-temporadas-servidor.ps1

Por cada temporada: la extrae en el servidor (`scripts/claude/extrae-temporada-cola.mjs`, ya montado en el
contenedor), la copia a `_traspaso\` y la importa con `importar-temporada.ps1 -Paquete` sin tocar la cola viva.
Sustituye a `importa-y-genera-santa-marta.ps1` para la parte de importar; el informe se genera después con
`pnpm informe:dashboard --equipo <inscripción> --pdf`. Comprobación: el grupo 24218968 (1ª Provincial Juvenil de
Salamanca, el de Santa Marta B) tiene que tener 21 actas en el canónico del PC (J1-J3), no 7.

## 12. (09/10) Las caídas del servidor: disco duro saturado + memoria pegada al techo

Ver `docs/plataforma-web/CAIDAS-SERVIDOR-2026-10-09.md`. Resumen: E/S al 94-98 %, `sdb` (disco duro de 5.400 rpm)
al 87 % con 126 op/s, carga 45, el slice tocando su techo 4 millones de veces sin un OOM; la caída del 08/10 fue un
bloqueo de 10 h sin una línea en el diario. Tres pasos, en orden: (1) perfiles de Chrome al SSD (código hecho:
desplegar y recrear los recolectores), (2) `FACYLF_MEMORIA_GB=6.5` en `docker/.env` del servidor, (3)
`systemd-oomd` con `ManagedOOMMemoryPressure=kill` al 60 % en el slice. Comprobar con las cifras del documento.

## 13. (09/10) Andalucía al PC — y una corrección sobre CyL

Ver `docs/plataforma-web/REPARTO-PC-SERVIDOR-2026-10-09.md`. Los pendientes de CyL **no** están aplazados: contando
cada máquina con SUS temporadas, hay 15.288 vencidos en el servidor y 31.783 en el PC; lo único aplazado de verdad son
las jornadas futuras de 2026-27. Faltan hasta ~95.000 actas de CyL: entre 1 y 3 semanas al ritmo actual. Para descargar el servidor, mover **Andalucía** (≈ 184.000 pendientes vencidos, la que
más trabajo tiene; no Asturias, que tiene ~2.700) con `scripts\claude\traspasa-federaciones-al-pc.ps1
-Federaciones andalucia -Aplicar` (probar antes sin `-Aplicar`). Galicia después, si el PC aguanta: tiene 3 GB libres.
