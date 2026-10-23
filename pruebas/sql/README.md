# Pruebas SQL con PostgreSQL embebido (PGlite)

Comprueban las migraciones y las consultas web **sin tocar ninguna base real**: cada ejecución crea un
PostgreSQL en memoria, aplica todas las migraciones de `infra/migraciones` y monta un caso inventado.

| Fichero | Qué prueba | Comprobaciones |
|---|---|---|
| `m29.mjs` | 0029: minutos (volantes, doble amarilla deducida, prórroga), posiciones, escalones, edad por categoría, A/B, cadete en juvenil, traspaso, sanciones inferidas, ciclo de amarillas, árbitros (formatos y « / »), ojeo y consultas de `ojeo.ts` | 52 |
| `m30.mjs` | 0030: chequeos de salud, apertura/cierre de alertas, recordatorios, histórico diario, purga | 9 |
| `m31.mjs` | 0031: alta con invitación (caducada, agotada, sin código), aprobación, favoritos por línea de equipo, tope, accesos rápidos, avisos (programado, cambio de horario, resultado, acta, jornada completa), sin nombres de menores, tope por pasada, idempotencia | 19 |
| `m32.mjs` | 0032: capacidad por edición (niveles, umbrales), minutos nulos sin cambios, proyección v3, casos de datos (detección, autocierre, revisión con permiso) | 11 |
| `m33.mjs` | 0033: espacios apagados por defecto, sin anuncios en páginas con menores ni para paquetes sin anuncios, elección de campaña por segmento, recuento diario | 6 |
| `m34.mjs` | 0034: auditoría con autor, antes/después, sin claves push, sin ruido de último acceso | 3 |

| `m35.mjs` | 0035: chequeos de la plataforma (avisos, push, correo, registros, entradas fallidas, administradores, publicidad), purga, y las 15 consultas de `admin.ts` con datos vacíos | 31 |
| `m36.mjs` | 0036: ojeo precalculado (ventanas, puntuación por quinta, vista compatible, recálculo entero), etiquetas de caché | 11 |

| `m37.mjs` | 0037: recorrido completo de un usuario — perfil y validaciones, preferencias, favoritos sin duplicados (misma línea desde dos temporadas, mismo club dos veces), reordenar, Mi panel, avisos leídos, push sólo https, exportar mis datos, baja (y el último administrador no puede) | 27 |
| `m38.mjs` | 0038: perfil de las 24 fuentes, avisos de página según lo medido en cada competición (Cataluña antes y después de releer, Madrid por temporada), auditoría del perfil | 14 |

| `analisis.mjs` | consultas de `analisis.ts` (forma, rachas, casa/fuera, reparto de goles, rachas del grupo) con un caso de respuestas conocidas | 12 |

| `m39.mjs` | 0039: métricas de uso propias (vistas por pantalla, usuarios, acierto de caché, retención) | 5 |

| `m40.mjs` | 0040: tanda de penaltis (restricciones, ganador, caso P4 que se abre, se cierra solo y se reabre) | 7 |

| `m41.mjs` | 0041: buscador por palabras (el índice se mantiene solo al proyectar y al borrar; alias sin duplicar; palabras en cualquier orden; comienzo de palabra; orden; filtro de tipo; tildes; búsqueda vacía) | 11 |

| `m42.mjs` | 0042: publicidad medida (vistas visibles, eventos validados, reparto uniforme, tope diario, interruptor general, paquete sin anuncios, nunca con menores, informe con CPM/importe fijo/AdSense estimado, consultas del panel) | 19 |

| `m43.mjs` | 0043: ciclo de cuentas (invitaciones personales y anuladas, alta, aprobación con aviso, rechazo y bloqueo con motivo, caducidad y su aviso, estado de acceso por petición, administradores sin doble verificación, freno por contraseñas fallidas sin guardar el correo, purga, consultas del panel de cuentas) | 33 |

| `m44.mjs` | 0044: estados de página (sin calendario, empieza el…, pendiente de la federación, no lo publica, sin medir = se pinta; página de equipo; rapidez) | 8 |

| `m45.mjs` | 0045: buscador por pares (nombre y apellido comunes a la vez, en cualquier orden, a medias; palabras separadas sin perder a nadie; la consulta no cambia al pasar por una plantilla de JS) | 8 |

| `m46.mjs` | 0046: las ocho federaciones del servidor dejan de estar «sin medir» (rasgos medidos, lo no medido sigue NULL, avisos de identidad, auditoría, repetible) | 41 |

| `m47.mjs` | 0047: recuentos del canónico en una fila (`ops.recuento_canonico`), recalculada por el proyector; cuadra con las tablas y sigue a los datos | 19 |

Total: 345 comprobaciones.

## Banco de volumen y rendimiento

```bash
node pruebas/sql/volumen.mjs /tmp/facylf-volumen 14            # base inventada a escala (~6 min, ~1 GB en disco)
node --experimental-strip-types pruebas/sql/rendimiento.mjs /tmp/facylf-volumen   # EXPLAIN ANALYZE de las 64 consultas
```
Explicación y resultados: `docs/plataforma-web/RENDIMIENTO-BASE.md`.

```bash
# una vez, en una carpeta fuera del repo si npm no puede instalar en él:
npm i @electric-sql/pglite@0.5
# desde la raíz del repo (o con FACYLF_MIGRACIONES=ruta1,ruta2 para probar migraciones sueltas):
node pruebas/sql/m29.mjs
node pruebas/sql/m30.mjs
for m in 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47; do node pruebas/sql/m$m.mjs; done
node pruebas/sql/analisis.mjs
```

Esperado: «TODO OK» al final de cada una. Cualquier «✗» enseña qué dato no cuadra.
`pg_stat_statements` se quita al aplicar (PGlite no la tiene).
