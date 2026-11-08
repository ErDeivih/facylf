# Plan de recuperación de 2020-21 y 2021-22

Estado medido el 08/11/2026. El problema **no es el importador**: la cola local no tiene
actas terminadas suficientes para esos grupos. El importador solo consume actas en estado `hecho`;
las que están `pendiente` no existen todavía en el canónico.

## Qué falta exactamente

### 2020-21 en el canónico local

- **31 ediciones**; 9 completas.
- Grupos: 182 completos, 138 `verificada_hasta_jornada`, 17 `parcial_privada`.
- Los 138 verificados tienen **557 partidos conocidos de 1.204 esperados** y **94 actas**.
- Los 17 parciales aportan 405 partidos conocidos, 290 con resultado y 231 actas.
- Faltan **647 partidos** solo en los grupos verificados, además de actas y calendarios.

### 2021-22 en el canónico local

- **66 ediciones**; 11 completas.
- Grupos: 122 completos, 95 `verificada_hasta_jornada`, 63 `parcial_privada`.
- Los 95 verificados tienen **797 partidos de 2.025 esperados** y **168 actas**.
- Los 63 parciales tienen 3.717 conocidos, 2.867 con resultado y 2.705 actas.
- Faltan **1.228 partidos** en los grupos verificados, además de actas.

### Lo que sí está en la cola local (pendiente de recolectar)

| Temporada | Tipo | Estado | Trabajos |
|---|---|---|---:|
| 2020-21 | acta | pendiente | **551** |
| 2020-21 | jornada | pendiente | **1.665** |
| 2020-21 | calendario | pendiente | 131 |
| 2020-21 | clasificación | pendiente | 133 |
| 2021-22 | jornada | pendiente | **2.005** |
| 2021-22 | calendario | pendiente | 94 |
| 2021-22 | clasificación | pendiente | 96 |
| 2021-22 | acta | cancelado | 56 |

## De dónde sale

La fuente es el portal de la federación (`rfcylf.es`), cuyas URLs ya están planificadas en
`descargas-federacion/recolector-local/cola-v2.sqlite`. No hace falta inventar partidos ni copiar
de otra base: hay que **dejar que el recolector ejecute esos trabajos pendientes** y luego importar
las actas resultantes.

El bloqueo era de configuración de temporadas:

- `temporadas-asignadas.txt` no incluía `2020-21`;
- el suelo de recolección (`FACYLF_TEMPORADA_MINIMA`) estaba en `2023-24`, así que los trabajos de
  2020-21 y 2021-22 quedaban aplazados aunque estuvieran en la cola.

Corrección aplicada: se añadió `2020-21` a la asignación y se arrancó una sesión controlada del
recolector con `FACYLF_TEMPORADA_MINIMA=2020-21`. La sesión normal del supervisor puede seguir
con las temporadas recientes; esta sesión de recuperación ataca el histórico.

## Secuencia de recuperación

1. Copia de seguridad de `cola-v2.sqlite` antes de tocar nada.
2. Sesión de recolector con `FACYLF_TEMPORADA_MINIMA=2020-21` y asignación que incluya 2020-21.
3. Medir `trabajos` por tipo/estado: deben bajar `acta pendiente` y `jornada pendiente`.
4. Cuando haya actas `hecho`, importar por tandas:

   ```powershell
   node scripts\importar-masivo.mjs --federaciones federacion `
     --temporadas 2020-21,2021-22 --minutos 20 --limite 0
   ```

5. Revisar los grupos que sigan incompletos. Casos ya vistos que no se resuelven reimportando:
   - `35372`: C.D. Casco Viejo, código 9796 de otro ámbito;
   - `35413`: C.D. Quintanar-Palacio, código 7990 de otro ámbito;
   - `35415`: Gª Segoviana C.F., código 16779 de otro ámbito;
   - varios actas cuyo calendario y acta no comparten equipos.
   Estos necesitan resolución de identidad/calendario, no otro pase del importador.
6. Proyectar, abrir la app y comprobar jornadas, actas y clasificación de 2020-21 y 2021-22.
7. Actualizar `ESTADO-AGENTE.md` (`resumen:`) y `WALL.md` con la tabla.

## Criterio de cierre

Una temporada se considera cerrada solo cuando **todas sus ediciones** tienen todos los grupos en
`completa`: jornadas 1..N, partidos con resultado, actas disponibles parseadas y clasificación.
No se cierra por «ya no quedan trabajos en la cola» si faltan resultados.
