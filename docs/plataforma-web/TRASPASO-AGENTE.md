# Traspaso al siguiente agente

**Fecha:** 22/09/2026, ~23:30 (hora de Madrid).
**Estado:** el despliegue está hecho y verificado; lo que queda es **subir el ritmo de recolección** y
**rehacer la plataforma de consultas**. Todo lo de abajo está medido, no supuesto.

---

## ⚠️ Actualización del 23/09/2026: lee `RITMO-MEDIDO.md` antes de empezar

La medición de este traspaso se ha hecho y **corrige su premisa en dos puntos**. El detalle, con números y
herramientas, está en [`RITMO-MEDIDO.md`](./RITMO-MEDIDO.md). En resumen:

1. **No hay ~16 s «sin explicar».** La máquina está al **97,8 % de procesador** (3,91 núcleos de demanda sobre
   4) y el ritmo medido es exactamente el que cabe en ella: `4 núcleos ÷ 3,82 s de CPU por petición =
   62,8 pet/min`, frente a los 61–68 medidos. **La CPU es el recurso escaso, no el trabajo local del worker**
   (eso cuesta 76 ms por trabajo, el 0,8 % del ciclo).
2. **(B) no sirve para las PNFG.** La cortesía se mide de inicio a inicio y **sólo manda cuando el trabajo dura
   menos que ella**. En 12 de 14 federaciones el hueco mediano (8,8–19,9 s) ya **supera** la cortesía máxima
   configurada (8 s), así que `ritmo.antes()` espera 0 s: **bajarla no cambia nada**. La única federación
   donde manda de verdad es **Valencia**.
3. **El método de (B) de este documento no funciona tal como está escrito**: `recolector.<fed>.config.json`
   viaja **dentro de la imagen** (no se monta por volumen) y `aplica-turnos.sh` sólo recrea el contenedor con
   la misma imagen. Cambiar el JSON no habría hecho nada, en silencio. **Ya está arreglado** reenviando
   `FACYLF_ARGS` desde `docker/entrada-recolector.sh`.
4. **(C) empeora el problema**, no lo mejora: no hay procesador que repartir entre dos pestañas.
5. **El importador no es una palanca de CPU** y bajarle la cuota es contraproducente: retiene el bloqueo de la
   cola (unidades de hasta 1 195 s) y Galicia acumula 250 «database is locked».

---

## 1 · Dónde está todo

| qué | dónde |
|---|---|
| servidor | `ssh david@servidor.local` (192.168.1.138, Debian 12, 4 núcleos, 15,9 GB de RAM) |
| repositorio | `/srv/data/facylf` (¡NO `/opt/stacks`, que pide root para el checkout!) |
| datos | `/srv/data/facylf/descargas-<fed>/` (colas + archivo), `/srv/data/backups/facylf/` |
| canónico | PostgreSQL 18 en el contenedor `facylf-postgres` |
| web | `http://100.117.58.93:3100` (tailnet), HTTP 200 |
| estado del monitor | `/srv/data/facylf/estado/` (`colas.json`, `historial.jsonl`, `alertas.log`, `importacion*.json`) |
| PC | **sin ningún proceso de facylf** (0 node, 0 Chrome, 28 tareas deshabilitadas), 11 GB de RAM libres. Sus datos intactos y ya copiados al servidor |

**Contraseña de `david`:** `12345678` (el responsable la sabe; se lo recomendé cambiar).
**`sudo` sin contraseña:** ya está concedido (`/etc/sudoers.d/facylf`, instalado con `visudo -c` antes de
dejarlo puesto). Se revoca con `sudo rm /etc/sudoers.d/facylf`.

**DNS del host:** funciona (comprobado: `github.com`, `registry-1.docker.io` y `registry.npmjs.org` resuelven,
`curl -I https://github.com` da 200). Por eso la imagen se puede reconstruir.

---

## 2 · Reglas del servidor que hay que respetar (todas aprendidas a golpes)

1. **El host NO tiene Node, ni pnpm, ni `sqlite3`, ni `rsync`.** Todo lo que necesite Node se ejecuta dentro de
   un contenedor con la imagen del recolector y el repositorio montado:
   ```bash
   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local /app/scripts/<lo-que-sea>.mjs
   ```
2. **PowerShell se come las comillas** al pasar órdenes por `ssh` (paréntesis, tuberías, `sed`, plantillas Go
   de `docker inspect`…). **Regla de oro: escribir un `.sh` local, `scp`, y ejecutarlo.** Se han perdido horas
   por esto.
3. **Nunca `docker kill` con `--filter ancestor=facylf-recolectores:local`**: mata también los 19 recolectores
   (pasó una vez; volvieron solos, pero se perdió media hora). Para matar sólo la copia de seguridad está
   `scripts/servidor/corta-copias.sh`.
4. **Nunca `pkill -f <patrón>` cuyo patrón aparezca en tu propia línea de órdenes**: te matas la sesión. El
   patrón va en un fichero aparte (ver `para-copias.sh`).
5. **`docker logs` sale vacío a propósito**: el registro de cada recolector está en
   `descargas-<fed>/recolector-local/worker-programado.log`. Para leerlo: `scripts/servidor/lee-registro.sh <fed> [líneas]`.
6. **Copiar una cola con el recolector dentro la deja ilegible** (`database disk image is malformed`).
   `copiar-datos.mjs` ya se niega a hacerlo; no lo fuerces con `--forzar` salvo caso justificado.
7. **Los contenedores crean carpetas como `root`**, y eso rompe dos cosas: la copia desde el PC (el `tar` no
   puede escribir dentro) y la retención de copias. Arreglo puntual:
   `scripts/servidor/arregla-permisos-datos.sh [federación…]`. **Arreglo de fondo pendiente**: que los 19
   contenedores corran con `user: "1000:1000"` (una línea en el ancla del compose, pero hay que hacer `chown`
   de lo ya creado y comprobar que Chrome arranca igual).
8. **El host no tiene Node: los resúmenes con JSON se leen dentro del contenedor del monitor**
   (`resume-colas.mjs`, `resume-importacion.mjs`). El monitor monta `/srv/data/facylf` en `/app`.
9. **Los datos no están en el repositorio** (`.gitignore` → `descargas-*/`). Cada actualización del repo del
   servidor aparta en un `stash` lo que no está versionado, así que **nada que sea dato puede ir dentro de la
   imagen**: se monta por volumen (así se arregló el catálogo de sondeo de Madrid y Valencia).
10. **awk:** `system` es una función incorporada y no se puede usar como variable. **bash:** los nombres de
    variable no admiten `ñ` ni acentos.

---

## 3 · Estado medido ahora mismo

| | valor |
|---|---|
| federaciones | 19 · **15 pidiendo** · 4 sin trabajo (todo aplazado a fechas futuras) · **0 colas ilegibles** |
| ritmo | **~60 peticiones/min** (1 751 en la ventana de 30 min = 58,4/min; pico 63,2) ≈ 3 600 páginas/hora |
| procesador | **94 % calculando** (3,74 de 4 núcleos), **5,3 % esperando a disco** |
| memoria | 9,8 GB usados de 15,9 · **16 plazas** de navegador (`FACYLF_MEMORIA_GB=14`), ninguna espera |
| canónico | **629 lotes** · 2,4 M de filas importadas · ~612 de 8 267 unidades |
| fallos | **0,4 %** de las peticiones |
| disco | `/srv/data` = `/dev/sdb1` (disco DURO, 458 GB). `/` = `/dev/sda3` (SSD, **177 GB libres**) |
| límite duro | `facylf.slice`: `MemoryMax=12G` (drop-in en `/etc/systemd/system/facylf.slice.d/limite.conf`) y `CPUWeight=10000` |

### Lo que ya se hizo para subir el ritmo (y funcionó)

- Quitar la **copia de seguridad** del disco mientras recolecta (iowait 47 % → 5 %; se rehará sola a las 03:30
  por `cron`, y a mano quedaron 15 colas verificadas hoy).
- **16 plazas** en vez de 12 (había esperas de plaza de 0–7 por hora y federación).
- Se cortaron los **bucles de caída** de Madrid y Valencia (se caían 9–12 veces/hora).

**Resultado: de ~30 a ~60 peticiones/min.**

---

## 4 · Lo que hay que hacer ahora (en este orden)

### (A) Encontrar los ~16 s por petición que no están explicados — **empieza por aquí**

Cuenta hecha con una hora de Andalucía (125 peticiones):

| concepto | tiempo |
|---|---|
| dentro de la petición HTTP | 393 s (mediana **3,5 s** por petición) |
| cortesía configurada (125 × ~7 s) | ~875 s |
| render de la página en Chrome | ~375 s |
| **sin explicar** | **~1 957 s ≈ 16 s por petición** |

Y la palanca del análisis está **descartada con datos**: medido con 20 actas reales,
`mide-analisis-acta.mjs` → leer+descomprimir 6,7 ms, `parseaActa` 13,4 ms, guardar 0,2 ms = **20 ms por acta,
el 0,2 % del hueco**. No insistas por ahí.

**Hipótesis a comprobar:** el *trabajo local* que el worker hace entre peticiones («Preparando vigilancia y
ámbito de actas», «Revisando calendario futuro y jornadas recientes», sincronizar catálogo). Sale en el
registro a cada paso y **no genera ninguna petición**.

**Cómo medirlo:** instrumentar el ciclo del worker con marcas de tiempo por fase (nueva petición → render →
análisis → guardado → trabajo local → cortesía) y volcar un resumen por sesión a un fichero, en UNA federación
primero (por ejemplo `galicia` o `murcia`), y sólo después al resto. Con eso se decide si ese trabajo local se
puede hacer cada N peticiones, en otro momento, o si de verdad es imprescindible.

**Cuidado:** la cortesía de `ritmo.antes()` se mide **de inicio a inicio** (`iniciada_en + minimo + jitter`), así
que **se solapa en parte con la página**: no cuentes la cortesía y el render como si se sumaran siempre.

### (B) Bajar la cortesía por federación y buscar el límite de cada portal

Dónde se configura: **`recolector.<federación>.config.json`** (raíz del repositorio), bloque `ritmo`:

```json
"ritmo": { "intervaloMinSeg": 6, "intervaloMaxSeg": 8, "maxPeticionesDia": 200000, "maxTrabajosSesion": 200000 }
```

Valores de hoy: **6–8 s** en las 17 PNFG; **4–6 s** en Madrid y Valencia (son API, no navegador).

**Método (por pasos, una federación a la vez, y medido):**

1. Estado de partida por federación: `diagnostica-ritmo.mjs` (peticiones, duración, hueco entre peticiones) y
   `cuenta-sesiones.sh` (arranques, esperas de plaza, código 1).
2. Bajar a 5–7 s, dejar 30 min, volver a medir: peticiones/min **y fallos** (en `colas.json`:
   `fallosVentana`; y en el registro: `403`, `429`, `robots`, respuestas vacías, `codigo 1`).
3. Si no hay fallos nuevos, bajar otro escalón (4–6, 3–5…). **Parar al primer síntoma de bloqueo** y dejar esa
   federación **un escalón por encima** del que falló.
4. Escribir el resultado en la tabla de abajo, federación por federación. Los portales son distintos: **cada
   uno tendrá su límite**, no hay un número único.

| federación | cortesía actual | escalón probado | fallos | límite encontrado |
|---|---|---|---|---|
| **(medido el 23/09/2026 — ver `RITMO-MEDIDO.md` §3)** | | | | |
| andalucia | 6-8 s | — | 0 | **no aplica**: el hueco entre peticiones es 9,1 s, mayor que la cortesía → ya espera 0 s |
| aragon | 6-8 s | — | 0 | no aplica (hueco 8,8 s) |
| asturias | 6-8 s | — | 0 | no aplica (hueco 8,9 s) |
| baleares | 6-8 s | — | 0 | no aplica (hueco 8,8 s) |
| cantabria | 6-8 s | — | 0 | no aplica (hueco 9,4 s) |
| castilla-la-mancha | 6-8 s | — | 0 | no aplica (hueco 17,2 s) |
| cataluna | 6-8 s | — | 0 | no aplica (hueco 19,9 s) |
| extremadura | 6-8 s | — | 0 | no aplica (hueco 9,7 s) |
| galicia | 6-8 s | — | 0 | **al borde** (hueco 7,9 s); además sufre 250 «database is locked» |
| madrid | 4-6 s | — | 0 | no aplica (hueco 7,9 s, ya mayor que el máximo) |
| melilla | 6-8 s | — | 0 | no aplica (hueco 14,2 s) |
| murcia | 6-8 s | — | 0 | no aplica (hueco 8,7 s) |
| navarra | 6-8 s | — | 0 | no aplica (hueco 8,8 s) |
| **valencia** | 4-6 s | **2-3 s** | en curso | **única donde la cortesía manda** (hueco 5,6 s dentro del rango); prueba en curso, ver §9 de `RITMO-MEDIDO.md` |

**Cómo se ha medido:** `mide-huecos.mjs` compara el hueco mediano entre inicios de petición con la cortesía
configurada. Si el hueco es mayor, la cortesía ya no se está esperando y bajarla no puede subir el ritmo. Las
federaciones sin trabajo (canarias, ceuta, euskadi, federacion, rioja) no salen porque no hacen peticiones.

**Red de seguridad:** si una federación empieza a fallar, se le sube la cortesía en el acto; el fichero de
configuración se cambia y se recrea su contenedor
(`bash scripts/servidor/aplica-turnos.sh <federación>`), sin tocar las demás.

### (C) Dos pestañas por federación

Sólo si (A) y (B) no bastan, como dijo el responsable. Duplicaría el ritmo de cada portal a costa de pedirle
cada 2–4 s en vez de 4–8. **No lo hagas sin comprobar (B) primero.**

### (D) La plataforma de consultas (la otra mitad del objetivo)

**El problema no es de estilos, es de datos**: `/canonico` lee las consultas del canónico (rol de sólo lectura)
y **enseña datos reales**, pero la **portada, `/federaciones` y `/competiciones` leen el repositorio local
antiguo** (`apps/web/src/.../repositorio-local.ts`, `datos.ts`) y por eso salen a cero.

Orden de trabajo:

1. **Capa de datos canónica primero**: que todas las páginas lean `packages/canonico/src/consultas/*` a través
   del rol de sólo lectura. Sin esto, cualquier rediseño enseña ceros bonitos.
2. **Rediseño como producto de consulta, no como chat**: federación → temporada → competición → grupo → equipo,
   con tablas reales, clasificaciones y comparativas; **estados honestos** (`pendiente`, `no publicado`,
   `sin datos`, nunca un cero inventado), y **cada número con su procedencia y su fecha**.
3. **Si además se quiere un asistente**, aplican las referencias que pasó el responsable:
   - **Generative UI**: que el modelo devuelva **componentes** (tabla, gráfico, ficha), no texto — el estándar
     actual es `vercel/ai` (AI SDK). Referencias de diseño: <https://vibeui.online/>,
     <https://styles.refero.design/ai-agents/design-md-examples>,
     <https://github.com/context-dot-dev/designmd-supply>.
   - **Salida estructurada** para que un modelo pequeño no invente ni un campo: Pydantic/JSON Schema y, si algún
     día es local, `outlines-dev/outlines`, `microsoft/guidance`, `stanfordnlp/dspy`,
     `microsoft/semantic-kernel`.
   - Orquestación oculta en el backend (`langgenius/dify`, `lobehub/lobe-chat` como referencia de interfaz).

**Invariantes que NO se pueden romper** (están en `CLAUDE.md`): trabajar en español; no inventar datos
(desconocido ≠ no publicado ≠ pendiente ≠ cero); una identidad externa siempre con federación y contexto;
club ≠ equipo-temporada ≠ inscripción; nada de nombres de menores ni datos abiertos a Internet.

---

## 5 · Herramientas del servidor (`scripts/servidor/`), para no reescribirlas

| herramienta | para qué |
|---|---|
| `estado-general.sh` | la foto completa: sistema, flota, plazas, importador, canónico, copias, web |
| `estado-cpu-real.sh` | **separa «procesador calculando» de «esperando a disco»** (clave: `top` engaña) |
| `mide-cpu.sh` | consumo por grupo medido en un intervalo (no una foto) |
| `quien-consume.sh`, `reparte-cpu-real.sh` | qué proceso consume y a qué cgroup pertenece |
| `estado-plazas.sh` | plazas ocupadas y federaciones esperando |
| `estado-recolectores.sh` | tabla por federación: pidiendo / sin trabajo / cola ilegible |
| `lee-registro.sh <fed> [n]` | el registro de verdad (el de stdout está vacío) |
| `diagnostica-ritmo.mjs` | duración por petición, hueco entre peticiones, sesiones, pendientes |
| `cuenta-sesiones.sh [min]` | arranques de sesión, esperas de plaza y caídas por federación |
| `compara-ritmo.mjs <historial.jsonl>` | el histórico por tramos: peticiones/min y memoria |
| `mide-analisis-acta.mjs [n] [fed]` | coste de leer + analizar + guardar un acta (los 20 ms) |
| `copiar-datos.mjs` | copia colas y archivo del PC al servidor (se niega con el recolector dentro) |
| `compara-datos.mjs` / `compara-ficheros.mjs` | qué falta en el servidor (MB y **ficheros exactos**) |
| `arregla-permisos-datos.sh` | `chown` de los datos sin `sudo` (contenedor efímero como root) |
| `copia-cola.mjs`, `copias.sh`, `vigila-copia.sh`, `corta-copias.sh` | copias de seguridad de las colas |
| `calcula-turnos.mjs`, `aplica-turnos.sh`, `ajusta-ritmo.sh` | turnos, cuotas de CPU y plazas |
| `verifica-integridad-colas.sh [--completa]` | `quick_check` de las colas |
| `instala-sudo-sin-contrasena.sh` | el permiso de `sudo` (con `visudo -c` antes de instalarlo) |
| `primeros-pasos-sudo.sh` | DNS del host y tope de la rebanada (ya aplicado) |

**Leer el ritmo sin abrir nada:**
```bash
sudo scp david@servidor.local:/srv/data/facylf/estado/historial.jsonl .   # una línea por minuto
node scripts/servidor/compara-ritmo.mjs historial.jsonl
```

---

## 6 · Pendientes pequeños (no olvidar)

- **14 ficheros** de Madrid (unos cientos de bytes, en `t21-2025-26/comp-26412359/grupo-26412375/actas-menores`)
  que no se copiaron; el resto del archivo está completo en las 19 federaciones.
- **Que los recolectores no creen carpetas como `root`** (`user: "1000:1000"`), que es la causa de fondo del
  punto anterior y de que la retención de copias no pueda borrar.
- **86 unidades del importador con fallo**, de las que **66 son «nombre de equipo no resuelto en la fuente»**
  (el resolutor de `packages/canonico/src/resolucion/inscripcion.ts` no encuentra el equipo en el catálogo del
  grupo; ejemplo real: «C. F. Boomerang S. D.»). Es trabajo de producto, con pruebas, y bloquearía ~10 % de las
  unidades.
- **2 unidades apartadas** (baleares y cantabria) por descuadre de validación; se reintentan con
  `--reintentar-apartados`.
- **La copia de seguridad completa** de las 19 colas: hoy se hicieron 15 a mano y verificadas; el `cron` de las
  03:30 hará el resto (tarda horas porque copia bases vivas: ~0,3 MB/s con la flota dentro).
- **RadioPV**: sus contenedores están parados y su autodeploy llevaba fallando desde el reinicio por el DNS.
  Con el DNS arreglado debería funcionar solo; no es nuestro, pero conviene mirarlo.
