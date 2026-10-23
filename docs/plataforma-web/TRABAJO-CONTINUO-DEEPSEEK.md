# Trabajo continuo para DeepSeek — manual de operación (desde el 11/10/2026)

Este documento es **el único que DeepSeek necesita para trabajar días seguidos sin que nadie le diga qué hacer**.

- Lo escribió Claude tras repasar todos los encargos anteriores: 06/10, 11/10, cierre de temporada, multideporte, fútbol aficionado y la revisión de la ingesta.
- Si algo de aquí contradice a un documento más antiguo, **manda este**.
- El detalle de cada paso de despliegue sigue en `ENCARGO-DEEPSEEK-2026-10-11.md`.

**El objetivo de David:** todos los datos del fútbol no profesional de España (las 19 federaciones territoriales y sus provinciales/insulares, el fútbol aficionado y los demás deportes ya empezados), recogidos **completos**, a un ritmo **cerca del máximo respetuoso**, y **juntos en el PC**.

---

## 0. Cada vez que empieces (5 minutos)

1. Lee `docs/plataforma-web/ESTADO-DEEPSEEK.md`.
   - Si hay algo **EN CURSO**, sigue con eso.
   - Si hay algo **ESPERANDO HASTA <hora>** y la hora ya pasó, retómalo.
2. Haz la **ronda de salud** (§2.1). Si sale algo rojo, eso pasa delante de todo.
3. Coge trabajo por este orden:
   1. lo que diga `ESTADO-DEEPSEEK.md` como siguiente;
   2. la primera tarea **LISTA** de la cola (§3);
   3. el trabajo de fondo (§4), que no se acaba nunca.

## 1. Las reglas de no parar

- **No se espera mirando.** Si una tarea pide esperar (verificar a las 2 h, que entre una tanda, que termine una importación), apunta en `ESTADO-DEEPSEEK.md` «ESPERANDO HASTA hh:mm — qué mirar» y pasa a la siguiente.
- **Un bloqueo no para el día.** Si una tarea se atasca, escribe el motivo exacto y lo que haría falta (§5), márcala **BLOQUEADA** y sigue con otra. Vuelve a ella solo si cambia algo.
- **Cada tarea acaba con una comprobación.** Un número, una línea de registro, un `código 0`. No con «debería funcionar». Si la comprobación no sale, la tarea no está hecha.
- **El estado se escribe al empezar, al terminar y al bloquearte.** Lo que no está en `ESTADO-DEEPSEEK.md` no ha pasado para el siguiente que llegue (tú mismo mañana, o Claude).
- **Mide con la tabla `peticiones`**, nunca con `trabajos.actualizado_en`: `encola()` lo toca en cada arranque aunque no se pida nada. Herramienta: `scripts/claude/ritmo-peticiones.mjs`.
- **Comprueba que el número cuadra con lo que debería ser**, no solo que no hay error. Así se encontraron hoy los tres «suelos» de temporadas: «Plan local preparado: 4 temporadas» no era un error, pero la web publica 14.

### Lo que NUNCA se hace, aunque parezca útil

- **EL SERVIDOR NO SE SOBRECARGA NI SE LE AGOTA LA RAM** (regla de David, 13/10/2026). Se cayó el 11/10 y el 13/10 por traer federaciones encadenadas con la flota ya al tope.
  - Una sola traída a la vez, de pocas temporadas en pocas (`trae-federacion-servidor.ps1` trae como mucho 4 por pasada), mejor de noche.
  - Antes y después de cada temporada se mide el servidor. El script lo hace solo y **espera o se para** si la memoria disponible baja de 3 GiB, la swap pasa de 1 GiB o la carga pasa de 14.
  - Nada de extracciones en paralelo, ni de `docker cp` o copias grandes en `/tmp` del servidor.
  - Si el servidor va justo, la recolección de las 19 federaciones va primero: lo nuestro espera.

| Nunca | Por qué |
|---|---|
| `docker cp` de código | Se pierde al recrear el contenedor. El código va con `scripts\claude\despliega-codigo-servidor.ps1`. |
| `docker compose up -d` sin lista de servicios | Levanta las territoriales y lo que recoge el PC: peticiones dobles. Siempre con lista y `--no-deps`. |
| Tocar energía, suspensión, servicios o ajustes de Windows del PC | Es el PC personal de David. |
| Mover una federación de máquina | Decisión de David (11/10). |
| Bajar la pausa entre peticiones (5–8 s por web), quitar la identificación del cliente o usar proxies | Es la regla de respeto del proyecto. |
| Esquivar un bloqueo (403 de un portal que filtra automatismos, CAPTCHA, ofuscación) | FCBQ, FAB, `resultados.rfef.es` y Murcia baloncesto se quedan fuera hasta que haya permiso. |
| Recoger el endpoint de inscritos del tenis, DNI, correos o teléfonos | Privacidad. Ya está fuera del código y no se reabre. |
| Publicar nombres de menores o abrir datos a Internet | La instancia es privada (CLAUDE.md). |
| Borrar colas, evidencias o paquetes `_traspaso` sin comprobar antes que su contenido está a salvo | No hay papelera. |
| Hacer commits | Solo si David lo pide. |

### Cuándo SÍ hay que preguntar a David (y seguir con otra cosa mientras)

- Algo que borra o sobrescribe datos que no se pueden recuperar.
- Un coste nuevo, una cuenta nueva o pedir acceso a un tercero (Clupik/Leverade, Competize, FCBQ, FAB, RFEF).
- Cambiar el suelo de temporadas (hoy 2010-11) o el reparto de CyL entre máquinas.
- Algo que cambie cómo usa David su PC.

---

## 2. Rutinas fijas

Los comandos son del PC (PowerShell, en `F:\EspacioCodigo\facylf`) o del servidor (`ssh servidor`, en `/srv/data/facylf`). En el servidor:

```bash
C="docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml"
SRV="aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
```

### 2.1 Ronda de salud — al empezar y cada 2 horas (≤ 10 min)

```bash
# servidor
uptime; docker ps --format '{{.Names}} {{.Status}}' | grep facylf | sort
docker exec -e FACYLF_RAIZ=/app facylf-monitor node --no-warnings /app/scripts/claude/ritmo-peticiones.mjs $SRV
docker logs --tail 30 facylf-monitor 2>&1 | grep -iE 'aviso|bloque|error' | tail -5
```
```powershell
# PC
$env:FACYLF_RAIZ = (Get-Location).Path
node --no-warnings scripts\claude\ritmo-peticiones.mjs andalucia federacion madrid cataluna valencia
Get-Content registros\supervisor-flota.log -Tail 5
```

**Rojo** (va delante de todo):
- una federación con trabajo vencido y 0 peticiones en 1 h;
- `bloqueo` o `error` en más del 5 % de sus peticiones;
- carga media de 15 min por encima de 45 en el servidor;
- un contenedor reiniciándose;
- el supervisor del PC sin escribir en 30 min (salvo que el PC esté suspendido: eso es normal y no se toca).

**Referencias de ritmo:**
- por federación activa, 4.500–7.400 peticiones cada 24 h en el servidor y ~5.000 en el PC;
- el tope respetuoso por web es de 450–720 por hora.

### 2.2 Ronda diaria (por la mañana)

1. **La temporada en curso va primero** (carril nuevo).
   ```bash
   for f in galicia federacion aragon; do docker exec facylf-$f-1 node --no-warnings /app/scripts/claude/que-sirve.mjs /app/descargas-$f/recolector-local/cola-v2.sqlite 3; done
   ```
   La «prioridad mínima vencida» de 2026-27 debe ser negativa (≈ −1.400.000.000) o `null`.
2. **Qué queda en cada cola**, en dos tandas para no pasar de 10 min:
   ```bash
   docker exec -e FACYLF_RAIZ=/app facylf-monitor node --no-warnings /app/scripts/claude/estado-colas.mjs <federaciones>
   ```
3. **Traer datos del servidor al PC**: dos o tres federaciones por día, en rotación, con `scripts\claude\trae-federacion-servidor.ps1` (tarea T-04).
4. Apunta en `ESTADO-DEEPSEEK.md` una línea por máquina con el ritmo y lo que queda.

### 2.3 Ronda semanal (lunes)

1. **Cierre de temporada**, todas las federaciones: `node scripts/claude/cierre-temporada.mjs <fed> --canonico` (en el servidor, dentro de `facylf-monitor` con `FACYLF_RAIZ=/app`).
   - Actualiza la tabla de `docs/plataforma-web/CIERRE-DE-TEMPORADA.md`.
   - Una temporada **CERRADA** no se vuelve a mirar.
2. **Calidad del multideporte**: `node scripts/multideporte/calidad.mjs`. Un adaptador con fecha, equipos o marcador por debajo de lo de la semana anterior se investiga.
3. **Catálogo de la temporada en curso**: comparar competiciones por temporada en la cola (`competiciones-por-temporada.mjs`) con las de la semana pasada. En septiembre y octubre las federaciones publican categorías nuevas cada semana. Si una federación no crece en dos semanas, mira si su `catalogo_temporada` falla.
4. **Rutina completa de traer al PC**: todas las federaciones del servidor (T-04).

---

## 3. La cola de tareas (por prioridad)

**Estados:** LISTA · EN CURSO · ESPERANDO HASTA · BLOQUEADA · HECHA. Copia el estado de cada una en `ESTADO-DEEPSEEK.md`.

| ID | Tarea | Hecha cuando… |
|---|---|---|
| **T-01** | Paso **1c** del encargo del 11/10: desplegar el tercer suelo en el servidor y reiniciar aragon, castilla-la-mancha, euskadi, extremadura, asturias, navarra y federacion. | En el PC, Andalucía dice «14 temporadas y 9.269 competiciones». En el servidor salen `13-14`, `12-13`, `11-12` y `10-11` en `competiciones-por-temporada.mjs` donde el catálogo las tiene. |
| **T-02** | Paso **2**: verificar carril, temporadas, monitor, Cataluña y ritmo. | Los cinco controles del encargo, con su número apuntado. |
| **T-03** | Paso **3**: reabrir lo cancelado por la red (`reabre-cancelados-por-red.mjs`, primero sin `--aplicar`). | Recuento antes y después. ~40 en el servidor y 33 en Madrid. |
| **T-04** | Paso **4**: **toda la información en el PC.** Primero una temporada de rioja con `-SoloTraer`; luego federación a federación con `-Todas`, de pequeñas a grandes; después, rotación diaria y completa los lunes. | Por federación, `importar-temporada.ps1` termina sin fallos de grupo, o con la lista de fallos guardada. `informe:buscar` encuentra equipos de esa federación en el PC. |
| **T-05** | Paso **5**: **las cinco territoriales**, una al día: bizkaia → gipuzkoa → araba → tenerife → laspalmas. Solo con la ronda de salud en verde 24 h. Comprobar que `compose-turnos.yml` las incluye. | Cada una 24 h con ritmo y sin bloqueos. Una importación de prueba de un grupo al canónico; si la rechaza, BLOQUEADA y a Claude con el error. |
| **T-06** | Paso **6**: **Valencia** (`INVALID_PAGE_TOKEN`). Una sola petición de prueba con `Referer`, cookie y token de la página. Solo si da 200, al recolector. | Valencia pide sin `bloqueo` 24 h. Su 2024-25 deja de tener 0 partidos. |
| **T-07** | Paso **7**: **Melilla** 2015-16 a 2021-22, con navegador. | Anotado si el portal publica algo por otro camino. Si no, temporadas cerradas por fuente. |
| **T-08** | Paso **8**: **ritmo cerca del máximo.** Medir 24 h. Si una federación con trabajo vencido va por debajo de 250/h, mirar su contenedor: turnos, memoria, navegador. | Tabla antes/después en `ESTADO-DEEPSEEK.md`. Nada se acelera bajando la pausa por web. |
| **T-09** | **Monitor limpio**: añadir `prueba-10gb` a `FACYLF_EXCLUIR` en `docker/.env` del servidor y recrear el monitor (`bash scripts/servidor/recrea-monitor.sh`). | El monitor ya no lista `prueba-10gb` ni `andalucia`. |
| **T-10** | **systemd-oomd** (pendiente del 09/10, punto 12.3): `ManagedOOMMemoryPressure=kill` al 60 % en `facylf.slice`. **Solo si** la presión de memoria «full» pasa del 5 % sostenido; si no, se deja anotado como innecesario. | `systemctl show facylf.slice` lo muestra, o una nota con la medida que lo hace innecesario. |
| **T-11** | **Multideporte, actas y menores**: comprobar si `scripts\multideporte\aplica-menores-y-actas.ps1` se aplicó (05/10). Si no, aplicarlo: para los recolectores, relee la evidencia y los vuelve a lanzar. | `calidad.mjs` muestra jugadores en `serversports` y actas de balonmano leídas. |
| **T-12** | **Fútbol aficionado de toda España: barrido por zonas.** Tarea larga con manual propio: **`TAREA-LARGA-FUTBOL-AFICIONADO.md`** (once zonas, una por sesión; cómo estudiar cada portal, añadir la liga a un adaptador con `sembrar` o escribir uno nuevo, y qué queda fuera). | Las once zonas `HECHA` en su §6, cada liga en un adaptador probado, anotada para Claude, en «pedir acceso» o descartada con motivo. |
| **T-13** | **Revisitas con fecha**: Playooz y FAVAFUTSAL en noviembre; pádel FEP (re-sondeo); «vercompeti.php» (Palencia, Fuenlabrada, UAM) cuando haya datos. | Apuntadas en `ESTADO-DEEPSEEK.md` con fecha y hechas al llegar. |

**Para Claude, no para DeepSeek** (apúntalas si las ves, no las hagas):
- código de lectores y parsers nuevos;
- los 58 minutos que no cuadran en el informe de Santa Marta;
- cambios del canónico o de migraciones;
- la mejora de la web de informes (`docs/informes/MEJORAR-WEB-INFORMES.md`, que trabaja otro agente con el laboratorio REA).

---

## 4. Trabajo de fondo (cuando la cola está vacía o todo está esperando)

Por este orden. Cada vuelta deja una línea en `ESTADO-DEEPSEEK.md`.

0. **Avanzar el barrido de fútbol aficionado (T-12)**, una zona por sesión, siguiendo `TAREA-LARGA-FUTBOL-AFICIONADO.md`. Es la tarea larga de fondo: siempre hay algo que hacer en ella.

1. **Huecos de catálogo.**
   - Comparar `competiciones-por-temporada.mjs` de cada federación con su catálogo (`descargas-<fed>/competiciones-por-temporada.json`) y con el sondeo (`descargas-federacion-sondeo/<fed>-sondeo.json`).
   - Toda temporada ≥ 2010-11 que la web publique y no esté en la cola es un fallo: es lo que se encontró hoy.
2. **Grupos vacíos de temporadas cerradas**: `scripts/claude/grupos-vacios.mjs <fed> <temporada>`. Separar «la web no tiene partidos» de «no se leyó bien», y mandar los segundos a Claude con ejemplos.
3. **Actas canceladas por motivo**: `scripts/claude/actas-canceladas.mjs`. Un motivo nuevo o que crece es una tarea nueva.
4. **Calidad del multideporte** (`calidad.mjs`) y adaptadores «sin trabajo» con páginas pendientes: ¿son revisitas programadas (normal) o se han quedado atrás?
5. **Documentación**: si algo de este manual ya no es cierto, corrígelo con fecha y motivo.

---

## 5. Cómo se escribe un bloqueo (para que Claude o David lo resuelvan sin preguntarte)

```
### BLOQUEADA · T-0X · <título> · <fecha hora>
- Qué intentaba: …
- Qué comando y qué salió (literal, las 10 líneas que importan): …
- Qué he comprobado ya: …
- Qué necesito y de quién (Claude: código / David: decisión): …
- Mientras tanto sigo con: T-0Y
```

## 6. Informe a David (al final del día, corto)

Cinco líneas como máximo:
1. qué está recogiendo cada máquina;
2. el ritmo;
3. qué se ha terminado;
4. qué está bloqueado y qué hace falta;
5. qué toca mañana.

Sin adornos y con números. Si algo se dijo mal el día anterior, la primera línea lo corrige.
