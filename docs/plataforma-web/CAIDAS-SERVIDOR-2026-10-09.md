# Las caídas del servidor: medidas del 09/10/2026 y qué hacer

El límite de memoria del slice (`MemoryMax=12G`, corregido el 06/10) está en vigor y **no ha evitado** la
caída del 08/10. Medido el 09/10 a las 10:14 (peticiones 104 y 106 del enlace, sólo leen):

## Lo que se ve

| medida | valor | qué significa |
|---|---|---|
| carga (1/5/15 min) | 48,7 · 47,5 · 45,9 con 4 núcleos | casi todo son tareas esperando, no calculando |
| presión de E/S (`/proc/pressure/io`, some) | **94-98 %** | casi siempre hay alguien esperando al disco |
| presión de memoria del slice (some) | 45-54 % | la mitad del tiempo alguien espera a que se libere memoria |
| `memory.current` del slice | 12,87 GB de 12,88 (pegado al techo) | |
| `memory.events max` | **4.144.340** veces tocado el techo, 0 OOM | no mata nada: reclama páginas sin parar |
| `workingset_refault_file` | 301 millones | la caché de ficheros se tira y se vuelve a leer una y otra vez |
| disco `sdb` (`/srv/data`) | **WDC WD5000LPVX: disco duro de 2,5" a 5.400 rpm**, ocupado al 87 % con 77 lecturas + 49 escrituras/s | saturado con muy poco trabajo |
| disco `sda` (SSD, raíz, swap y colas en `/srv/ssd`) | ocupado al 29 % | holgado |
| procesos en estado D | `jbd2/sdb1` y cuatro `flush-8:16` | todos esperando a `sdb` |
| navegadores | 9 Chromium a la vez, 11 procesos cada uno | plazas = (10 − 1,5) / 0,75 = 11 con `FACYLF_MEMORIA_GB=10` |
| la caída del 08/10 | el diario del arranque anterior **termina a las 00:09:57** y el reinicio es a las 10:17 | 10 horas colgado sin escribir nada: no es un apagado, es un bloqueo |

## La explicación

Dos cuellos que se alimentan entre sí: el slice vive pegado a su techo de memoria, así que el núcleo tira caché
de ficheros y la vuelve a leer **del disco duro**; y ese disco duro ya está saturado porque los perfiles de Chrome
de los nueve navegadores (Cookies, History, Preferences: SQLite y LevelDB con `fsync`) viven en
`/srv/data/facylf/descargas-<fed>/recolector-local/perfil-chrome`, es decir, en el disco de 5.400 rpm. Cuando la
espera crece lo bastante, todo se queda en estado D y la máquina deja de responder sin que nadie llegue a morir
(por eso 0 OOM y ningún mensaje en el diario).

## Qué hacer (en este orden)

1. **Perfiles de Chrome al SSD** (código ya hecho, falta desplegar): `rutaPerfilChrome()` en
   `scripts/recolector-local.mjs` lee `FACYLF_DIR_PERFILES_CHROME`, y `docker/compose.yml` lo pone a
   `/srv/ssd/facylf/perfiles-chrome` (el SSD ya está montado en los 26 servicios). Al abrir Chrome se crea la carpeta
   y se retiran los `Singleton*` huérfanos. Desplegar = `scripts\claude\despliega-codigo-servidor.ps1`, copiar el
   compose y `up -d` de los recolectores (hay que **recrearlos**, no basta `restart`, porque cambia el entorno).
   `docker/entrada-recolector.sh` también está actualizado, pero va dentro de la imagen: entra en la próxima
   reconstrucción y mientras tanto no hace falta.
2. **Menos navegadores a la vez**: en `docker/.env` del servidor, `FACYLF_MEMORIA_GB=10` → **6,5** (plazas de 11 a
   6). Los turnos (`FACYLF_TURNO_PLAZA_MIN`) siguen repartiendo las plazas entre todas las federaciones; lo que hoy
   se pierde en espera de disco es más que lo que se gana con tres navegadores más.
3. **Red de seguridad: `systemd-oomd`** (necesita sudo): instalar el paquete `systemd-oomd`, activarlo y añadir al
   slice un segundo fichero (con saltos de línea DE VERDAD; usar `printf`, no `echo` con `\n`):

       [Slice]
       ManagedOOMMemoryPressure=kill
       ManagedOOMMemoryPressureLimit=60%

   Si la presión de memoria del slice pasa del 60 % durante 30 s, mata el contenedor que más presión cause
   (Docker lo vuelve a levantar) en vez de dejar colgada la máquina.

## Cómo saber si ha funcionado (una hora después y al día siguiente)

- carga de 1 min < 12; presión de E/S «some» < 30 %; `sdb` ocupado < 40 %;
- `memory.events max` crece mucho más despacio que 4 millones por día;
- y lo que importa: más de 4 días seguidos sin caída.

## El PC también para cada noche

Eventos de Windows (petición 105): se suspende el 07/10 a las 12:00 (1 h), el 08/10 a la 01:04 (9 h) y a las 19:50
(14 h). La suspensión por inactividad con corriente está en «nunca», así que la suspende alguien o algo (botón,
tapa, otro programa). Con eso el PC recoge unas 10-14 h al día. Decisión de David.
