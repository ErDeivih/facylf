# Lo que hay que hacer en el servidor Debian (y sólo una vez)

Esta carpeta tiene lo que no es código: el tope de memoria del conjunto y los pasos de instalación que se dan
**una vez**, no en cada arranque.

## 1 · El tope duro de 10 GB

```bash
sudo mkdir -p /etc/systemd/system/facylf.slice.d
sudo cp docker/servidor/facylf-slice.conf /etc/systemd/system/facylf.slice.d/limite.conf
sudo systemctl daemon-reload
systemctl show facylf.slice -p MemoryMax      # debe decir MemoryMax=10737418240
```

Con eso, todos los contenedores del compose (que cuelgan de `facylf.slice`) comparten el techo. Los límites por
contenedor (1,6 GB) son una red de seguridad para un navegador desbocado; el reparto de verdad lo hace el
gobernador de dentro, que con `FACYLF_MEMORIA_GB=10` da **11 plazas**.

## 2 · Que arranque solo tras un reinicio

Docker, por defecto, arranca al iniciar el sistema y **levanta los contenedores con `restart: unless-stopped`**,
que es lo que trae el compose. No hace falta ningún `systemd` propio: comprobarlo con

```bash
systemctl is-enabled docker          # enabled
docker inspect facylf-recolectores-1 --format '{{.HostConfig.RestartPolicy.Name}}'   # unless-stopped
sudo reboot                          # y después: docker compose ps
```

## 3 · Lo que se copia al servidor

| qué | cómo |
|---|---|
| El programa | `git clone` o `rsync` del repositorio (sin `descargas-*`, sin `node_modules`) |
| **Las colas** (lo único irrecuperable) | `rsync -a descargas-*/ servidor:/srv/facylf/` — llevan el HTML archivado, la cola y los informes |
| La imagen | se construye en el servidor: `docker build -f docker/Dockerfile -t facylf-recolectores:local .` |
| Las variables | `cp docker/.env.ejemplo docker/.env` y revisar `FACYLF_MEMORIA_GB` |

## 4 · Copia de seguridad

Lo que hay que salvar son las colas (`descargas-*/recolector-local/cola-v2.sqlite` y el HTML archivado de al
lado). Se pueden copiar en caliente con SQLite:

```bash
for f in /srv/facylf/descargas-*/recolector-local/cola-v2.sqlite; do
  sqlite3 "$f" ".backup '$(dirname "$f")/copia-$(date +%F).sqlite'"
done
```

Y el canónico (PostgreSQL) con `pg_dump`, como en el resto del proyecto.

## 5 · Comprobaciones del primer día

```bash
node scripts/prueba-aceptacion-docker.mjs --federaciones prueba-10gb   # 7 de 7 (una federación)
# con tres federaciones y una sola plaza (contención de verdad): 9 de 9
node scripts/prueba-aceptacion-docker.mjs --federaciones prueba-10gb,canarias,ceuta --memoria-gb 2
# y los turnos: con más federaciones que plazas, todas entran a lo largo del día
node scripts/prueba-turnos-docker.mjs --federaciones prueba-a,prueba-b,prueba-c --memoria-gb 2 --turno-min 1 --minutos 6
docker compose -f docker/compose.yml --env-file docker/.env up -d
docker compose -f docker/compose.yml exec galicia node scripts/_diag-plazas.mjs 10
node scripts/vigilar-docker.mjs --cada-min 15 --duracion-min 480       # se deja corriendo un día
node scripts/vigilar-docker.mjs --informe
```

Ninguna de las dos pruebas toca nada que no sea suyo (contenedores propios y volumen de plazas propio), así que se
pueden lanzar con la flota en marcha.

Dos cosas que conviene saber al arrancar por primera vez:

- **la federación de prueba no arranca con el resto**: `prueba-10gb` va en el perfil `pruebas`, así que un
  `up -d` levanta las federaciones de verdad y ella sólo si se nombra (`up -d prueba-10gb`), que es justo lo que
  hace la prueba de aceptación;
- **la primera arrancada de cada contenedor ajusta su cola** (le añade la columna del día de Madrid y rellena las
  peticiones que ya había: medido el 19/09/2026, 4,7 s con 29 000 peticiones). Es una sola vez por federación y no
  hay que hacer nada a mano; a partir de ahí el cupo diario se cuenta por día civil de Madrid y su índice hace que
  cada petición cueste 0,05-0,1 ms.

## 5-bis · Que la vigilancia siga sola (cron del servidor)

Una medida de una tarde no demuestra nada sobre un servidor encendido 24/7. La vigilancia se programa con `cron`
**en el host** (mide los contenedores desde fuera, con el cliente de Docker, que no está dentro de la imagen):

```bash
crontab -e
# una vuelta cada hora
0 * * * * cd /srv/facylf && node scripts/vigilar-docker.mjs --cada-min 1 --duracion-min 1 >> pruebas/reconstruccion/vigilancia-cron.log 2>&1
# y el repaso del fin de semana lo hace su propio contenedor; si se prefiere aquí:
30 7 * * * cd /srv/facylf && node scripts/ingesta-fin-de-semana.mjs >> pruebas/reconstruccion/fin-de-semana-programado.log 2>&1
```

## 5-ter · Que la flota suelte capacidad según acaba (cron del servidor)

Las federaciones terminan a ritmos distintos: cada una tiene su cola y su última jornada. Un contenedor sin nada
que hacer no molesta mucho (~40 MB), pero son diecisiete, y esa memoria la necesita el resto del servidor.
`ajustar-flota.mjs` mira el trabajo que le queda a cada cola y **para** los contenedores que no tienen nada que
hacer hasta dentro de más de dos horas, **levanta** los que vuelven a tener trabajo y deja en paz a los demás (y
a los que no puede leer). Una pasada es idempotente y no hay idas y venidas.

```bash
node scripts/ajustar-flota.mjs            # informe: qué haría y cuánta memoria hay en marcha
node scripts/ajustar-flota.mjs --aplicar  # lo aplica

crontab -e
# cada quince minutos: la cola que termina suelta su contenedor y la que vuelve a tener trabajo lo recupera
*/15 * * * * cd /srv/facylf && node scripts/ajustar-flota.mjs --aplicar >> pruebas/reconstruccion/flota-cron.log 2>&1
```

Dos reglas que conviene tener presentes:

- **una federación terminada no se vuelve a levantar sola** (su plan dice `reanudarEn: null`), pero el trabajo
  sigue en la cola: cuando se reabra esa federación, se levanta con `docker compose up -d <servicio>`;
- **si el demonio de Docker no responde, no se toca nada** (ni se para ni se levanta): sin saber qué contenedores
  hay, parar a ciegas es peor que no hacer nada. El guion lo dice y sale con código 3.

Su tendencia se mira cuando haga falta:

```bash
node scripts/vigilar-docker.mjs --informe     # memoria por contenedor, reinicios, plazas, veces por encima del presupuesto
node scripts/vigilar-flota.mjs --informe      # ritmo por federación, huérfanos, federaciones atascadas
node scripts/auditar-capacidad.mjs            # la foto completa en pruebas/reconstruccion/auditoria-capacidad.md
```

## 6 · El día que se pasa del PC al servidor

El orden importa, porque **dos flotas sobre las mismas colas son trabajadores duplicados**: la misma federación
pedida dos veces y, si se comparte carpeta, dos procesos escribiendo en la misma SQLite. Los pasos:

1. **En el PC, parar la recolección** (no el resto del proyecto): deshabilitar las tareas programadas

   ```powershell
   Get-ScheduledTask | Where-Object { $_.TaskName -like 'FACyLF recolector*' } | Disable-ScheduledTask
   Get-ScheduledTask | Where-Object { $_.TaskName -like 'FACyLF ingesta fin de semana' } | Disable-ScheduledTask
   ```

   y comprobar que no queda ningún worker (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"`), incluidos
   los `node scripts/recolector-*.mjs`. El visor y la web pueden seguir.

2. **Copiar las colas** (con la recolección parada, para que la copia sea coherente):

   ```bash
   rsync -a --info=progress2 /ruta/pc/descargas-*/ servidor:/srv/facylf/
   ```

   Son las colas + el HTML archivado. Si se copia en caliente, usar `sqlite3 .backup` (sección 4).

3. **Arrancar en el servidor** y verificar con la lista del punto 5. La federación de prueba primero.

4. **Dejar el PC como respaldo, no como segunda flota**: las tareas del PC se quedan deshabilitadas. Si algún día
   hay que volver atrás, se para el compose (`docker compose down`) y se rehabilitan las tareas.

5. **Comprobar que no hay dos**: `docker compose exec galicia node scripts/_diag-plazas.mjs 10` en el servidor debe
   decir **11 plazas** y las federaciones del servidor; en el PC no debe haber ningún `recolector-*.mjs` vivo.

### Lo que NO hay que copiar

`node_modules` (se instala dentro de la imagen), `.estado-workers` (es estado de las plazas de esta máquina: el
servidor arranca con el suyo) y `pruebas/` (informes de este PC).
