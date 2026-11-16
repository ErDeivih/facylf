# Ingesta nocturna programada (16/11/2026)

**Qué es.** Una tarea diaria de Windows que importa al canónico lo que los recolectores ya han dejado en
las colas de las 19 federaciones. No arranca recolectores, no cambia pausas ni workers y no toca el
servidor. Es la pasada de cierre del día, con un límite de tiempo para no invadir la mañana.

## 1 · Lo que está registrado

| Pieza | Valor |
|---|---|
| Tarea | **`FACyLF ingesta nocturna`** (Programador de tareas de Windows) |
| Cuándo | **todos los días a las 03:40** (40 min después de la pasada horaria de las 03:00, para no solaparse) |
| Comando | `powershell -NoProfile -ExecutionPolicy Bypass -File F:\Proyectos\facylf\scripts\ingesta-nocturna.ps1` |
| Script | [`scripts/ingesta-nocturna.ps1`](../../scripts/ingesta-nocturna.ps1) |
| Límite | **25 minutos** de importación (parámetro `-Minutos`) |
| Temporada | **2026-27** (parámetro `-Temporada`) |
| Registro | `estado/ingesta-nocturna/AAAA-MM-DD.log` (una línea por paso y la salida del importador) |
| Marca | `estado/ingesta-nocturna.json` (`{fecha, antes, despues, codigo, hecho_en}`) |

Comprobado el 16/11/2026:

```
TaskName : FACyLF ingesta nocturna
State    : Ready
NextRunTime : 17/11/2026 3:40:00
```

## 2 · Qué hace, en orden

1. **Candado horario.** Si `estado/actualizacion.lock` tiene menos de 45 minutos, la pasada horaria está
   importando y la nocturna **no se solapa**: sale con código 0 y lo anota.
2. **Marca de la noche.** Si ya terminó bien hoy y han pasado menos de 6 horas, no repite el trabajo.
3. **Preflight.** Comprueba que el contenedor `facylf-postgres` está vivo y consultable; si no, sale con
   código 2 **sin tocar nada**.
4. **Antes.** Mide `partidos|actas|con resultado` y lo escribe en el registro.
5. **Importa.** `node scripts/importar-masivo.mjs --temporadas 2026-27 --minutos 25`, el mismo importador
   idempotente del paso 5: salta lo ya importado y hace *upsert* por clave natural.
6. **Después.** Vuelve a medir los tres números y escribe la marca con el código de salida.
7. **Suelta el candado** propio (`estado/ingesta-nocturna.lock`), incluso si el importador falla.

## 3 · Por qué es idempotente y no duplica

- **Estado del importador:** `estado/importacion.json` guarda las unidades hechas y apartadas. Una unidad
  hecha no se vuelve a importar; una apartada no se reintenta sola.
- **Clave natural:** el importador hace *upsert* por federación/competición/grupo/jornada/equipos (y por
  partido/persona en las alineaciones), nunca `insert` ciego.
- **Marca por noche:** una segunda ejecución el mismo día, antes de 6 horas, no hace nada.
- **Candado compartido:** no se solapa con la pasada horaria de CyL.

Comprobación después de una noche:

```powershell
Get-Content estado\ingesta-nocturna\2026-11-17.log
Get-Content estado\ingesta-nocturna.json
node scripts\importar-masivo.mjs --estado   # unidades pendientes y hechas
```

## 4 · Lo que NO hace

- No arranca ni para recolectores; no cambia la pausa entre peticiones ni el número de workers.
- No sube nada al servidor ni toca las copias de seguridad.
- No importa temporadas anteriores a 2026-27 (para el histórico está `scripts/importar-todo.mts`).
- No republica la demo: de eso se encargan `actualizacion-por-jornada.ps1` y `tmp/publica-demo.ps1`.
- No borra ni mueve nada de las colas: las abre en sólo lectura.

## 5 · Ejecutar a mano, simular y parar

```powershell
# no escribe nada: dice qué haría
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingesta-nocturna.ps1 -Simular

# una pasada real ahora (25 min)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingesta-nocturna.ps1

# otra duración
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingesta-nocturna.ps1 -Minutos 40

# parar la tarea (no desinstala nada)
schtasks /Change /TN "FACyLF ingesta nocturna" /DISABLE
```
