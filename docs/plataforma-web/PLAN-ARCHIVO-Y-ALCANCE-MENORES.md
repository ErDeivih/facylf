# Dos decisiones del 5 de octubre: alcance de menores y mudanza del archivo

Documento para Claude (y para quien siga). Recoge **las dos decisiones que ha tomado David** y, sobre todo, un
hallazgo que cambia una parte del trabajo y que conviene leer antes de tocar nada.

---

## 1 · Alcance de menores: **sí, se recoge todo**

**Lo que ha decidido David:** la instancia es de **uso propio y privado**, así que **se recoge todo igual que en
las federaciones de fútbol**. No hay excepción por categoría.

### 1.1 Antes de tocar nada: quién lo recoge ya y quién no

Medido el 05/10/2026, perfil a perfil:

| dónde | `actasAdultas` | `actasMenores` |
|---|---|---|
| **Castilla y León** (`recolector.config.json`) | `true` | **`true`** ✅ ya lo recoge |
| **Las 15 federaciones del servidor** (`perfiles/<fed>.json`) | **no declarado** | **no declarado** ❌ |

`permiteActasMenores()` es `valorConfig('alcance.actasMenores', false) === true`: **sin declararlo, es `false`**.
O sea que **hoy el servidor NO está recogiendo las actas de menores de esas 15 federaciones**, y lo ha estado
excluyendo en silencio todo este tiempo. Lo que sí hace es marcarlas `pendiente_ambito` y **no contarlas** en los
porcentajes — por eso el alcance no aparecía como problema en ningún informe.

Y ojo: **Madrid, Valencia y Cataluña no usan `perfiles/*.json`**. Sus guiones leen su propia configuración
(`recolector.<fed>.config.json`, que viaja dentro de la imagen). Hay que mirarla también, una por una.

### 1.2 Lo que hay que cambiar

Añadir a **cada uno de los 15 perfiles** del servidor (y comprobar los tres guiones propios):

```json
"alcance": { "actasAdultas": true, "actasMenores": true }
```

Y después, con el recolector ya reiniciado, **devolver a la cola lo que quedó fuera de ámbito**:

- `reconciliaAmbitoActas` (en `recolector-local.mjs`) vuelve a poner en `pendiente` las actas que estaban en
  `pendiente_ambito` **en cuanto el ámbito las permite** — se ejecuta sola al arrancar la sesión, así que basta
  con reiniciar. **No hay que reencolar nada a mano.**
- Pero esas actas llevan **aplazadas al año 2099** desde que se aplicó el suelo, y de aquella quedaron con
  `siguiente_intento` lejano. Hay que comprobar, por federación, que `reparaActasSinTrabajo` y
  `reactivaTemporadasAsignadas` las devuelven de verdad — es el mismo agujero que se cerró en Castilla y León.

### 1.3 Y esto es lo que hay que decirle a David antes de hacerlo

**Encenderlo multiplica el trabajo pendiente, y los porcentajes van a bajar.** Las actas de menores no estaban
contadas; en cuanto entren, el denominador crece. No es un retroceso: es que la foto era incompleta. Conviene
decirlo el mismo día que se enciende, para que nadie lo lea como una avería.

Y dos cosas que se mantienen aunque sea uso propio:

1. **Se recoge, pero no se publica.** La instancia es privada y no se abre a Internet. La regla de no publicar
   nombres de menores sigue siendo la misma: lo que cambia es que **se guardan**, no que se enseñen.
2. **Con esto ya se puede desbloquear el lector de las actas de balonmano** (1.716 descargadas y legibles), que
   estaba esperando esa decisión. En balonmano, igual: se leen todos los jugadores, con la misma política.

---

## 2 · Mudanza del archivo a E:

### 2.1 Por qué

| unidad | libre | de |
|---|---|---|
| C: | 103,5 GB | 464,8 |
| D: | 295,3 GB | 894,2 |
| **E:** ("Discazo") | **819,8 GB** | 931,5 |
| F: (el repositorio y los datos) | 59,7 GB | 208,3 |

El 5 de octubre, **C: se quedó en 3,8 GB libres** y **las cuatro federaciones del PC dejaron de recolectar**
durante casi dos horas: de ~2.300 peticiones por hora a 155. La causa era una fuga de 101 GB de perfiles
temporales de Chrome en `%TEMP%` (ya contenida con una tarea programada cada 6 h). Pero el aviso de fondo sigue
en pie: **el disco se llena y la recolección se para sin decir nada.**

Y ahora crece mucho más rápido. Medido hoy: **ServerSports pasó de 89 MB a 701 MB en un día** con el
paralelismo entre ligas. Con 18 adaptadores y el histórico entrando, los 59,7 GB que quedan en F: se van a
consumir.

### 2.2 La regla, y por qué no se mueve todo

**Lo que se escribe y se lee todo el tiempo se queda en el disco rápido. Lo que crece y se lee de tarde en
tarde se va a E:**

| qué | dónde | por qué |
|---|---|---|
| **Colas SQLite** (`cola-v2.sqlite`) | **se quedan en F:** | se escriben en cada trabajo; el proyecto ya midió que el disco era el cuello de botella |
| **Perfiles de Chrome** (`recolector-local/perfil-chrome`) | **se quedan en F:** | Chrome los lee y escribe constantemente |
| **Archivo de evidencia** (los `.gz` de HTML y JSON) | **a E:** | es el volumen; se escribe una vez y se lee muy de tarde en tarde |
| **Registros** (`worker-programado.log`) | **se quedan en F:** | se escriben en cada línea |

### 2.3 Cómo hacerlo, sin romper las rutas

1. **Antes de nada: copiar, no mover.** Con las colas paradas o entre tandas.
2. **Enlace de directorio**, no de fichero: `mklink /J` para que los recolectores sigan viendo **la misma
   ruta**. El código no se toca.
3. **Ojo con la trampa que ya nos costó un día entero:** los enlaces y uniones son **exactamente lo que dejó el
   Docker del PC sin arrancar** (`0x800701c0`, WSL se niega a atravesar un punto de montaje). Por eso:
   - un enlace **por federación**, no uno gigante para todo;
   - y **verificar después de cada uno**, no al final.
4. **Borrar el original sólo cuando la copia esté verificada**: tamaño igual y una lectura de prueba de un
   fichero de cada tipo.
5. **Verificar el ritmo al terminar**: `node scripts/mira-ritmo-cola.mjs <cola>` en dos o tres federaciones. Si
   el disco duro de E: frena la recolección, se verá en los segundos entre peticiones — y entonces se vuelve
   atrás la parte que corresponda.

### 2.4 Lo que NO hay que hacer

- **No mover las colas a E:**. Si es un disco duro y no un SSD, cada escritura se paga en el ritmo de
  recolección. Fue el cuello de botella medido en su día.
- **No hacerlo de golpe para las 19 federaciones.** Una o dos, medir, y seguir.
- **No borrar el original «para comprobar si funciona».** El archivo es la evidencia: sin él, un grupo ya no se
  puede reinterpretar cuando se afine un parser (que es justo lo que se hizo hoy con las 447 fichas de
  ServerSports y las 1.857 de fmvoley).

---

## 3 · Lo que queda, para repartir

**De Claude (adaptadores y recolección):**
1. **Lector de las actas de balonmano** — desbloqueado con la decisión de §1. 1.716 descargadas esperando.
2. Los 150 fallos reales del importador: decidir la política cuando la tabla oficial no cuadra.
3. Las webs propias que quedan: Veteranos Vigo, Liga de la Amistad de León, Móstoles, Valdemoro.
4. Lo aparcado: FAVAFUTSAL (vuelve en noviembre), Navalcarnero, Cartagena sala.

**De infraestructura:**
1. **Encender el alcance de menores** en las 15 federaciones y comprobar que las actas vuelven a la cola.
2. **La mudanza del archivo a E:**, según §2.
3. **El servidor se apaga cada 2-4 días.** La hipótesis viva es cuelgue bajo carga, no batería (hoy la batería
   está estable a 0,00 W). Falta saber si el diario es persistente y mirar el watchdog en la BIOS.
4. **Cataluña**: los 125.354 trabajos cancelados de 2025-26 y confirmar de dónde salen los ~3.400 cierres
   locales.
5. **La causa de la fuga de `scoped_dir`**: la limpieza ya está, el origen no.

---

## 4 · Lo que hay que saber antes de tocar, en una lista

1. **Cuando fallen a la vez cosas que no tienen relación, mira el disco antes que el código.** Chrome no avisa
   de que no tiene espacio: deja de funcionar.
2. **Un valor ausente no es `false`, pero se comporta como tal.** `alcance.actasMenores` sin declarar excluye
   las actas de menores **en silencio**, y no aparece en ningún porcentaje. Eso es lo que ha pasado en 15
   federaciones durante semanas.
3. **Los enlaces rompen cosas.** Ya costaron un día de Docker caído.
4. **Desconocido, no publicado y pendiente son estados distintos. Nunca se convierten en cero.**
5. **No se cambia el ritmo de un sitio**: una petición cada 5-8 s, nunca dos a la vez. El paralelismo entre
   webs distintas sí es legítimo; bajar el intervalo contra la misma, no.
