# Los recolectores en Docker (servidor Debian de 10 GB)

Esto es lo que hay que hacer en el servidor para que la ingesta corra dentro de contenedores, con el
presupuesto de 10 GB respetado por dentro y por fuera, y con la pasada del fin de semana programada.

## Lo que hay aquí

| fichero | qué es |
|---|---|
| `Dockerfile` | La imagen: Node 24 + Chromium y su conductor sobre Debian. Construye el parser de actas y deja el contenedor listo para ser un supervisor de federación |
| `entrada-recolector.sh` | El supervisor de UNA federación dentro de su contenedor: arranca el worker, espera lo que diga `proximo-trabajo.mjs` y lo vuelve a arrancar (es el equivalente Linux de `ejecutar-recolector-programador.ps1`) |
| `entrada-fin-de-semana.sh` | La pasada del fin de semana, sin cron: un bucle que duerme hasta la hora fijada (07:30 de Madrid) y lanza `ingesta-fin-de-semana.mjs` |
| `compose.yml` | Una federación por servicio (18), la pasada del fin de semana, y la rebanada de cgroup que pone el tope duro de memoria |

## Cómo se reparte la memoria (lo importante)

Hay **dos** controles, y hacen cosas distintas:

1. **El gobernador de plazas**, dentro del programa (`scripts/lib/presupuesto-memoria.mjs`). Reparte
   `FACYLF_MEMORIA_GB` (10 por defecto) en plazas de navegador de 0,75 GB —el coste medido—, o sea **11
   plazas**. Las fichas viven en el volumen `plazas`, que ven todos los contenedores: el reparto es
   compartido, así que 18 federaciones no pueden decidir a la vez que hay sitio.
2. **La rebanada de cgroup**, fuera del programa, que es el tope duro que pidió el servidor. Todos los
   servicios cuelgan de `facylf.slice`, y a esa rebanada se le pone el máximo una vez:

   ```bash
   # en el servidor, una sola vez
   sudo mkdir -p /etc/systemd/system/facylf.slice.d
   sudo tee /etc/systemd/system/facylf.slice.d/limite.conf >/dev/null <<'EOF'
   [Slice]
   MemoryMax=10G
   MemorySwapMax=0
   EOF
   sudo systemctl daemon-reload
   ```

   Con eso, si algún día un navegador se desmadra, el kernel no deja que el conjunto pase de 10 GB: lo que se
   queda sin memoria es un recolector (que reintenta), no el servidor.

## Puesta en marcha

```bash
# 1. El programa y los datos
git clone <repositorio> /srv/facylf && cd /srv/facylf

# 2. Las colas: se copian del PC al servidor (o se empieza de cero y el planificador las llena)
rsync -a --info=progress2 PC:/ruta/facylf/descargas-* /srv/facylf/

# 3. La imagen (se construye EN el servidor: el contexto es el repositorio)
docker build -f docker/Dockerfile -t facylf-recolectores:local .

# 4. El tope duro de memoria (una vez, ver arriba) y las variables
cp docker/.env.ejemplo docker/.env      # y revisar FACYLF_MEMORIA_GB

# 5. Arrancar (primero la federación de prueba, luego las de verdad)
docker compose -f docker/compose.yml --env-file docker/.env up -d prueba-10gb
docker compose -f docker/compose.yml --env-file docker/.env logs -f prueba-10gb
docker compose -f docker/compose.yml --env-file docker/.env up -d
```

### Primer arranque en el servidor: la lista de comprobación

Lo primero, la prueba automática —comprueba el compose, el arranque, que se recolecta de verdad, el semáforo de
plazas entre contenedores, el presupuesto de memoria y que al parar no queden plazas fantasma—:

```bash
docker compose -f docker/compose.yml up -d prueba-10gb
node scripts/prueba-aceptacion-docker.mjs --federaciones prueba-10gb
```

La prueba **no toca nada que no sea suyo**: usa sus propios contenedores (`aceptacion-*`) y su propio volumen de
plazas, así que se puede lanzar con la recolección en marcha sin tumbar la flota (antes hacía un
`docker compose down -v` del proyecto entero: medido el 19/09/2026, se llevó por delante el contenedor de la
federación de prueba que se acababa de levantar).

Y, con tres federaciones y una sola plaza, la prueba de **turnos** —la que comprueba que con más federaciones que
plazas todas entran a lo largo del día, que nunca se ocupa una plaza de más y que una ficha de espera de un
contenedor muerto no deja esperando a los vivos—:

```bash
node scripts/prueba-turnos-docker.mjs --federaciones prueba-a,prueba-b,prueba-c \
  --volumen-datos facylf-datos-prueba --memoria-gb 2 --turno-min 1 --minutos 6
```

En el servidor, con las colas montadas de verdad, no hace falta `--volumen-datos`. Y después, a mano:

1. `docker compose config --quiet` no da error y lista los servicios esperados (20: 18 federaciones, la de
   prueba y la pasada del finde).
2. `docker compose exec prueba-10gb node scripts/_diag-plazas.mjs 10` dice cuántas plazas hay y quién las
   tiene: con 10 GB declarados tienen que ser **11**.
3. `docker stats` con la flota completa: el conjunto debe quedarse **por debajo de 10 GB**; si se acerca,
   mirar `docker compose exec <fed> node scripts/_diag-ritmo-real.mjs 30` (hay algo reciclando de más).
4. `systemctl show facylf.slice -p MemoryMax` en el host: `MemoryMax=10737418240` (10 GiB).
5. Al cabo de un día, `node scripts/vigilar-flota.mjs --informe` (desde cualquier contenedor) debe decir
   **0 federaciones atascadas** y huérfanos que no crecen.

Variables útiles (se ponen en un `.env` junto al `compose.yml`, o en el entorno):

| variable | por defecto | para qué |
|---|---|---|
| `FACYLF_MEMORIA_GB` | `10` | El presupuesto que reparte el gobernador |
| `FACYLF_TURNO_PLAZA_MIN` | `150` | Minutos que una federación conserva su plaza **si hay otras esperando**. Es lo que hace que las 18 entren a lo largo del día |
| `FACYLF_HORA_FINDE` | `07:30` | Hora de Madrid de la pasada del fin de semana |
| `FACYLF_CHROME_HEADLESS` | `1` | Chrome sin cabeza (dentro de Docker no hay pantalla) |

## Qué cambia respecto al PC de Windows

* **Chrome va sin cabeza** (`--headless=new --no-sandbox --disable-dev-shm-usage`). En el PC se abre «de
  verdad» pero fuera de la vista; en un contenedor no hay servidor gráfico.
* **No hay Programador de tareas**: cada federación tiene su contenedor con `restart: unless-stopped`, y esa
  es toda la supervisión que necesita. La pasada del fin de semana es otro contenedor con un bucle.
* **No hay PowerShell**: la limpieza de restos de Chrome que en Windows hace un guion `.ps1` aquí la hace
  `pkill` sobre el perfil de la federación, y el propio worker ya se salta esa parte cuando no está en Windows.
* **El reloj se mide con `os.freemem()`**, que en un contenedor informa de la memoria del HOST, no de la del
  contenedor. Por eso el presupuesto se declara con `FACYLF_MEMORIA_GB` en vez de deducirlo: es el número
  honesto.

## Comprobaciones que se le pueden pedir al servidor

```bash
# ¿quién tiene plaza y desde cuándo? (dentro de cualquier contenedor)
docker compose -f docker/compose.yml exec galicia node scripts/_diag-plazas.mjs 30

# ¿qué ha trabajado la flota en los últimos 15 minutos?
docker compose -f docker/compose.yml exec galicia node scripts/_diag-ultimos-minutos.mjs 15

# ¿cómo va el fin de semana?
docker compose -f docker/compose.yml exec fin-de-semana node scripts/ingesta-fin-de-semana.mjs --informe

# Y la vigilancia larga: una línea cada 10 minutos, con su informe al final
docker compose -f docker/compose.yml exec galicia node scripts/vigilar-flota.mjs --cada-min 10 --duracion-min 480
```

### Probar la imagen antes de tocar producción

El compose trae la federación de PRUEBA (`prueba-10gb`), que usa una cola propia marcada con `.PRUEBA` y no
aparece en los informes de la flota:

```bash
docker compose -f docker/compose.yml up -d prueba-10gb
docker compose -f docker/compose.yml logs -f prueba-10gb
docker compose -f docker/compose.yml down -v prueba-10gb
```

Es la forma de comprobar que la imagen, el semáforo de plazas y el navegador sin cabeza funcionan en el servidor
**antes** de arrancar las federaciones de verdad.

### Probar en Windows tiene una trampa (que en Debian no existe)

Docker Desktop comparte las carpetas de Windows con el contenedor por 9p/virtiofs, y **SQLite no puede abrir una
cola a través de ese puente** cuando la base está en WAL con su fichero `-shm` vivo: da `disk I/O error` o
`unable to open database file`. Medido el 18/09/2026, leyendo y escribiendo, con la cola tranquila y con la cola
en uso. La misma cola, copiada a un **volumen** de Docker (sistema de ficheros Linux), funciona a la primera.

Consecuencia práctica:

* el compose de producción monta las colas del host directamente porque **en el servidor eso es ext4** y no hay
  problema;
* para probar en el PC hay que meter copias de las colas en un volumen, y para eso están los guiones de prueba de
  esta carpeta:

```bash
# 1. copiar colas del PC a un volumen (Git Bash o WSL)
bash docker/_copia-colas-a-volumen.sh facylf-datos-prueba canarias ceuta
# 2. la pasada del fin de semana, dentro del contenedor y sobre ese volumen
docker run --rm -v facylf-datos-prueba:/app/datos -v "$PWD/docker":/d \
  --entrypoint bash facylf-recolectores:local /d/_pasada-en-volumen.sh canarias
# 3. un supervisor de federación sobre el volumen (para probar la rotación con varios contenedores)
docker run -d --name cont-1 -e FACYLF_MEMORIA_GB=2 -e FACYLF_TURNO_PLAZA_MIN=1 \
  -v facylf-datos-prueba:/app/datos -v facylf-plazas-docker:/app/.estado-workers -v "$PWD/docker":/d \
  facylf-recolectores:local bash /d/_entrada-en-volumen.sh canarias
# 4. ver las plazas y quién espera
docker run --rm -v facylf-plazas-docker:/app/.estado-workers -v "$PWD/docker":/d \
  --entrypoint bash facylf-recolectores:local /d/_lista-plazas.sh
```

## Lo que NO entra en la imagen

Las colas y los perfiles de Chrome (son datos: van en volúmenes), la web, `node_modules` del PC y los
artefactos de desarrollo. Está en `.dockerignore`, en la raíz.
