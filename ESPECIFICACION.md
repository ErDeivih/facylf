# Especificación — FACYLF, plataforma y reparto de la ingesta

Estado: **borrador para revisar**. Decisiones de David del 2026-11-04 aplicadas.

## Reparto de la ingesta: PC y servidor se reparten **temporadas**

**Decisión tomada**: el reparto **no es por federación ni por territorio**. Es por **temporadas**. El PC y el servidor se reparten las temporadas de cada competición, de modo que **ninguno de los dos se sobrecarga**.

**El servidor se queda como está ahora.** No se toca su configuración ni su carga. Todo cambio se hace en el lado del PC.

Consecuencias directas:

- [ ] Saber **qué temporadas está ingiriendo el servidor ahora mismo**, para no pedirlas en el PC.
- [ ] Definir en el PC la lista de temporadas que le tocan, escrita en configuración, no en un comentario.
- [ ] Comprobar que **ninguna temporada se recoge dos veces** (en septiembre se duplicaron ocho federaciones entre PC y servidor).
- [ ] Dejar la regla escrita: cuando una temporada pasa al servidor, se quita del PC.

## Objetivo 1 — Que no tenga errores

**Sigue siendo lo primero.** Hoy `pnpm test` devuelve `ELIFECYCLE Test failed`.

- [ ] Identificar **qué** prueba falla y por qué, una por una
- [ ] Registrarlo en un fichero
- [ ] Arreglarlas o marcar la deuda conocida
- [ ] Suite en verde antes de tocar la plataforma

## Objetivo 2 — La plataforma, desde el prototipo de Claude

**El prototipo existe y está en un artefacto de Claude:**

```
https://claude.ai/code/artifact/dd4385f3-20e6-4f8b-8746-9a4f022b0fa0
```

Instrucción original con la que se encargó: *«Implement this design in this codebase. Read the design's files from that link. Match how it looks, using this codebase's own components and conventions.»*

**Bloqueante, y hay que decirlo claro**: ese enlace **solo se abre con la sesión de Claude de David**. Se comprobó el 2026-11-04: devuelve HTTP 200 pero el contenido es una página que se renderiza con JavaScript y no incluye el diseño. **Ningún agente ni yo podemos leer los ficheros del diseño desde ahí.**

Para poder implementarlo hace falta una de estas tres cosas:

- [ ] Exportar el artefacto a ficheros (HTML/CSS o el código) y dejarlos en el repositorio, por ejemplo en `diseno/`
- [ ] Pegar el HTML/CSS en un fichero del repositorio
- [ ] Al menos, capturas de las pantallas

Hasta que exista uno de los tres, la plataforma **no se empieza**: implementar «parecido» a un diseño que no se puede leer es inventarlo.

## Familia y recetas

Familias **A (panel de datos)** y **D (catálogo)**: clasificaciones, jornadas, actas, equipos. Densidad alta; en móvil, tabla convertida en tarjetas.

## Pantallas previstas (a concretar con el diseño delante)

- [ ] Clasificación por competición y grupo
- [ ] Jornada con sus partidos y actas
- [ ] Ficha de equipo con plantilla y resultados
- [ ] Ficha de partido con el acta
- [ ] Estado por competición sin datos, y error de fuente caída

## Cómo parar y arrancar sin romper nada

Verificado en esta sesión, y documentado por el propio proyecto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Simular
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Reactivar
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tarea-flota.ps1
```

El script **no toca ningún dato** y excluye DSH a propósito. Sobrevive el supervisor de multideporte: pararlo aparte.

## Riesgos que no se pueden ignorar

- **Las webs de las federaciones piden explícitamente no ser rastreadas.** El proyecto usa `FacylfBot/1.0` con espaciado y backoff. Cualquier cambio **mantiene** esas tres cosas.
- **Postgres en Docker** en el puerto 5433 con cuatro roles (`lector`, `app`, `publicador`, `migracion`). El `.env` tiene contraseñas: fuera de git.
- **Decenas de procesos de ingesta vivos.** Tocar el recolector exige parar con el script, no matar procesos a mano.

## Puertas antes de dar una pantalla por buena

1. `pnpm test` en verde.
2. La ingesta sigue funcionando: comprobar que se escriben ficheros nuevos después del cambio.
3. `ai-design-check` o la lista de diez.
4. Ojos frescos con este fichero y una captura.
