# Contrato de la sesión 3 — métricas del panel, V-E-D y tema

Registrado antes de implementar (2026-11-04, tarde) con la disciplina `grill-requirements` →
`red-green-tdd` → revisión adversarial. Decisiones de David al final de `ESPECIFICACION.md`.

## Objetivo

Publicar `metricas-facylf.json` con la estimación de CyL (competiciones totales, completas y porcentaje
que falta; desglose por temporada) y el ritmo de peticiones actual de PC y servidor, generado por el
proyecto con un script reproducible y probado; unificar la forma del equipo a V-E-D en toda la
aplicación; e implementar el tema claro/oscuro con resolución en servidor y control accesible.

## Alcance

Dentro:

- `scripts/metricas-facylf.mjs` + `scripts/lib/metricas-facylf.mjs` (puro) + sondeo del servidor por
  SSH de sólo lectura; tests puros; `metricas-facylf.json` en la raíz; `docs/plataforma-web/METRICAS-PANEL.md`.
- V-E-D en la presentación: `lib/forma-equipo.ts`, clasificación, `Racha`, ficha de equipo y
  actuaciones de jugador; el dato de dominio y las consultas no cambian.
- Tema claro/oscuro: cookie `tema`, `data-tema` en `<html>` resuelto en servidor, control en la
  cabecera, persistencia, axe en los dos temas.
- `resumen:` en `ESTADO-AGENTE.md`; pruebas, capturas y documentación.

Fuera: cambios de esquema, ingesta, servidor, migraciones; registrar tareas programadas sin permiso;
pantallas nuevas; panel de otro proyecto.

## Criterios de aceptación

1. `metricas-facylf.json` existe con la forma exacta y valores reales medidos.
2. El script regenera el fichero; si una fuente falla **no escribe** (deja el anterior y sale con error).
3. Las temporadas cubren las que se recogen de CyL y sus sumas cuadran con `cyl`.
4. `ritmo` es por minuto de una ventana reciente, separado PC/servidor.
5. Pruebas puras: unión de catálogos, porcentaje, forma exacta del JSON, formato de `medido`, `porMinuto`.
6. V-E-D: cabecera V-E-D, insignias V/E/D con palabra accesible; sin G/P como forma visible.
7. Tema: primer HTML correcto con/sin cookie, botón accesible que alterna y persiste, axe AA en ambos.
8. `pnpm test`, `pnpm lint`, `tsc --noEmit`, e2e de la pantalla 2 en verde.
9. Commit en `fase-c` y push único final; sin GitHub Actions.
10. `ESTADO-AGENTE.md` con `resumen:` en llano.

## Modos de fallo

Servidor SSH no disponible o canónico caído → no se publican cifras; se conserva el JSON anterior con
su fecha. Temporada sin competiciones en las colas pero con ediciones en el canónico → entra en el
total (unión). Código duplicado entre PC y servidor → cuenta una vez. Cookie ausente o inválida → tema
claro. El botón de tema no rompe la hidratación ni el teclado.

## Prioridades

Honestidad del dato y forma exacta del contrato por delante de la estética; después reproducibilidad y
pruebas; después V-E-D y tema. Si el servidor no responde, mejor un fichero viejo con fecha que dos
ceros falsos.

## No objetivos

No inventar datos, no tocar la ingesta ni el servidor (sólo lecturas), no cambiar el esquema, no
registrar tareas del PC sin permiso explícito, no abrir ramas, no usar GitHub Actions, no rehacer las
otras pantallas, no cambiar los recuentos numéricos a V-E-D (sólo la forma).
