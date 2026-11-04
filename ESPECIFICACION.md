# Especificación — FACYLF, plataforma de CyL

Estado: **borrador para revisar**. Tres objetivos en orden estricto, sin saltarse ninguno.

## Por qué CyL primero

No es una preferencia: **CyL es la implementación de referencia del proyecto**.

- `ESTADO.md`: el origen del proyecto es **Salamanca (Castilla y León)**, fuente `www.rfcylf.es`, con los datos en `descargas-federacion/` (19,4 GB, ya en E: con junction).
- `HALLAZGOS-FEDERACIONES.md`: **tres federaciones usan el mismo módulo de resultados que CyL** y «toda la lógica y los parsers se reutilizan tal cual».

Quien domina CyL, domina las demás. Por eso el PC recolecta **solo CyL** y el servidor el resto.

## Objetivo 1 — Que no tenga errores

**Antes que nada.** Hoy las pruebas están en rojo: `pnpm test` devuelve `ELIFECYCLE Test failed`.

- [ ] Saber **qué** prueba falla y por qué, una por una
- [ ] Registrarlo en un fichero, no en la cabeza
- [ ] Arreglarlas o marcar explícitamente cuáles son deuda conocida
- [ ] Dejar la suite en verde antes de tocar la plataforma

Sin esto, cualquier cambio en la plataforma se hace a ciegas.

## Objetivo 2 — Ingesta repartida: PC solo CyL

El proyecto ya está preparado: `parar-flota-pc.ps1` documenta que «la ingesta pasa a vivir en el servidor (`david@servidor.local:/srv/data/facylf`)», y el propio script avisa de que en septiembre **ocho federaciones se recogían a la vez en PC y servidor, duplicando workers**.

- [ ] Definir la lista exacta de lo que recoge el PC: **CyL y lo suyo**
- [ ] Confirmar que el resto está en el servidor y **no** en el PC
- [ ] Comprobar que ninguna cola del PC apunta a una federación ya servida por el servidor
- [ ] Dejar la lista escrita en la configuración, no en un comentario

**Cómo parar y arrancar sin romper nada** (ya verificado en esta sesión):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Simular
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Reactivar
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tarea-flota.ps1
```

El script documenta que **no toca ningún dato** y excluye DSH a propósito. Sobrevive el supervisor de multideporte: pararlo aparte.

## Objetivo 3 — La plataforma, desde el prototipo de Claude, con CyL

- [ ] Localizar el prototipo de CyL y decidir: se reutiliza o se rehace
- [ ] Escribir las pantallas de la plataforma en este fichero antes de tocar código
- [ ] Implementar solo CyL

## Familia y recetas

Familias **A (panel de datos)** y **D (catálogo)**: clasificaciones, jornadas, actas, equipos. Densidad alta; en móvil, tabla convertida en tarjetas.

## Pantallas previstas (a concretar tras rescatar el prototipo)

- [ ] Clasificación por competición y grupo
- [ ] Jornada con sus partidos y actas
- [ ] Ficha de equipo, con su plantilla y resultados
- [ ] Ficha de partido con el acta
- [ ] Estado vacío por competición sin datos, y error de fuente caída

## Riesgos que no se pueden ignorar

- **Las webs de las federaciones piden explícitamente no ser rastreadas.** El proyecto usa un cliente identificado (`FacylfBot/1.0`) con espaciado y backoff. Cualquier cambio en el recolector **mantiene** esas tres cosas.
- **Postgres en Docker** en el puerto 5433, con cuatro roles distintos (`lector`, `app`, `publicador`, `migracion`). El `.env` tiene contraseñas: **no entra en git**.
- **24 procesos de ingesta vivos** cuando se trabajó en esto. Tocar el recolector mientras corre exige parar con el script, no matar procesos a mano.

## Puertas antes de dar una pantalla por buena

1. `pnpm test` en verde.
2. La ingesta sigue funcionando después del cambio (comprobar que se escriben ficheros nuevos).
3. `ai-design-check` o la lista de diez.
4. Ojos frescos con este fichero y una captura.
