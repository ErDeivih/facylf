# Especificación — FACYLF, plataforma y reparto de la ingesta

Estado: **borrador con el diseño real delante**. Decisiones de David del 2026-11-04 aplicadas.

## El diseño ya existe y está en el repositorio

El prototipo de Claude son **22 pantallas**. Están versionadas en `diseno/prototipo/` (23 ficheros, 13,8 MB), extraídas del ZIP que había en Descargas. Ya no hay bloqueo: la plataforma se implementa **contra este diseño**, no contra una idea.

### Sistema visual, tal como se ve en el prototipo

| Elemento | Cómo es |
|---|---|
| Barra superior | Fondo **verde azulado muy oscuro**, logo, navegación (Explorar, Rankings, Ojeo, Comparar), aviso con contador, avatar y **buscador global** de jugador, club, equipo, competición o árbitro |
| Fondo | Gris muy claro; el contenido va en **tarjetas blancas** con esquinas redondeadas y sombra mínima |
| Acento | Verde azulado (`#0e7490` aproximado) en botones, pestaña activa y enlaces |
| Tipografía | Humanista, sin adornos; **los números mandan** (puntos, jornadas, goles) con tamaño y peso altos |
| Portada | Tarjeta oscura grande «¿A quién buscas?» con buscador y resultados: jugador, club o árbitro, con rol alineado a la derecha |
| Explorar competición | Cinco desplegables en fila: Federación, Temporada, Categoría, División, Grupo, y botón «Ver competición» |
| Clasificación | Tabla con `#`, escudo y nombre, `PJ`, `G-E-P`, `GOLES`, `FORMA` y `PTS`; **borde de color a la izquierda** según zona (asciende, fase de ascenso, promoción, desciende) y leyenda debajo |
| Forma | Insignias de color por resultado: verde gana, gris empata, rojo pierde |
| Cabecera de competición | Escudo con siglas, título, ruta de migas, desplegables de grupo y temporada, y **barra de progreso de la temporada** con «Jornada 12 de 30» |
| Pestañas | Clasificación · Jornadas · Goleadores · Disciplina · Equipos |
| Columna derecha | Jornada con resultados y goleadores con «Ver todos» |
| Honestidad del dato | Al pie: «Zonas según lo ocurrido en las últimas temporadas… Un administrador puede fijarlas» y un «Sobre estos datos» |

Las 22 pantallas, por si hace falta localizar una: Inicio · Competición · Acta del partido · Panel de equipo · Club · Jugador · Comparar jugadores · Rankings · Ojeo · Árbitro · Estadísticas de competición · Salud de la plataforma · Entrar y registrarse · Mi panel · Administración de usuarios · Calidad de datos · Publicidad · Mi cuenta · Federación · Gráficos · Administración de inicio · Estados vacíos.

### Decisiones de diseño que hay que confirmar

| Pregunta | Por qué importa | Estado |
|---|---|---|
| La forma del equipo: ¿`V-E-D` (Victoria/Empate/Derrota) o `G-E-P` (Ganado/Empatado/Perdido)? | **el prototipo usa las dos**: `V-E-D` en Inicio y `G-E-P` en Competición. Hay que elegir una | **pendiente** |
| ¿Las 22 pantallas entran todas en la primera tanda, o se recorta? | hacer 22 pantallas de golpe es un año | **pendiente** |
| ¿Se reutiliza el código de la plataforma que ya existe en `apps/`, o se rehace contra el diseño? | hay un `apps/` con web | **pendiente** |

## Objetivo 1 — Que no tenga errores (sigue siendo lo primero)

`pnpm test` devuelve hoy `ELIFECYCLE Test failed`.

- [ ] Identificar qué prueba falla y por qué, una por una
- [ ] Registrarlo en un fichero
- [ ] Arreglarlas o marcar la deuda conocida
- [ ] Suite en verde antes de tocar la plataforma

## Objetivo 2 — Reparto de la ingesta: PC y servidor **por temporadas**

**Decisión tomada**: el reparto **no es por federación ni por territorio**; es por **temporadas**, para que ninguno de los dos se sobrecargue.

**El servidor se queda exactamente como está.** Todo cambio se hace en el lado del PC.

- [ ] Saber qué temporadas ingiere el servidor ahora, para no pedirlas en el PC
- [ ] Dejar en el PC la lista de temporadas que le tocan, **en configuración**, no en un comentario
- [ ] Comprobar que ninguna temporada se recoge dos veces (en septiembre se duplicaron ocho federaciones)
- [ ] Regla escrita: cuando una temporada pasa al servidor, se quita del PC

## Objetivo 3 — La plataforma, contra el diseño

- [ ] Elegir la primera pantalla: **la clasificación** (`2 · Competición`), que es la que más valor da y la que más enseña del sistema visual
- [ ] Inventariar los datos reales que hacen falta para esa pantalla
- [ ] Implementar solo CyL, que es la implementación de referencia

## Familia y recetas

Familias **A (panel de datos)** y **D (catálogo)** de `RECETAS-UI.md`. Densidad alta; en móvil, la tabla se convierte en tarjetas.

## Cómo parar y arrancar la ingesta sin romper nada

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Simular
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Reactivar
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tarea-flota.ps1
```

**No toca ningún dato** y excluye DSH a propósito. Sobrevive el supervisor de multideporte: pararlo aparte.

## Riesgos

- **Las webs de las federaciones piden no ser rastreadas.** `FacylfBot/1.0` con espaciado y backoff se mantiene.
- **Postgres en Docker** en 5433 con cuatro roles. El `.env` con contraseñas queda fuera de git.
- **Decenas de procesos de ingesta vivos**: para tocarlos se para con el script.
