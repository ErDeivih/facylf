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
| La forma del equipo: ¿`V-E-D` (Victoria/Empate/Derrota) o `G-E-P` (Ganado/Empatado/Perdido)? | **el prototipo usa las dos**: `V-E-D` en Inicio y `G-E-P` en Competición. Hay que elegir una | **decidido: V-E-D** en toda la aplicación (04/11/2026), implementado |
| ¿Las 22 pantallas entran todas en la primera tanda, o se recorta? | hacer 22 pantallas de golpe es un año | **decidido (04/11/2026): cuatro** — clasificación, jornada, acta del partido y ficha de equipo. El resto, después, sobre la misma base |
| ¿Se reutiliza el código de la plataforma que ya existe en `apps/`, o se rehace contra el diseño? | hay un `apps/` con web | **decidido**: el diseño manda y se rehacen las pantallas; se conservan consultas, contratos e ingesta |

## Objetivo 1 — Que no tenga errores (sigue siendo lo primero)

`pnpm test` devuelve hoy `ELIFECYCLE Test failed`. **Hecho el 2026-11-04**: la suite está en verde
(633 de 634, 0 fallos; la única «saltada» ya lo estaba). El diagnóstico completo, prueba por prueba y
con su veredicto (fallo real o deuda conocida), está en [`INFORME-PRUEBAS.md`](INFORME-PRUEBAS.md).

- [x] Identificar qué prueba falla y por qué, una por una
- [x] Registrarlo en un fichero
- [x] Arreglarlas o marcar la deuda conocida
- [x] Suite en verde antes de tocar la plataforma

## Objetivo 2 — Reparto de la ingesta: PC y servidor **por temporadas**

**Decisión tomada**: el reparto **no es por federación ni por territorio**; es por **temporadas**, para que ninguno de los dos se sobrecargue.

**El servidor se queda exactamente como está.** Todo cambio se hace en el lado del PC.

- [ ] Saber qué temporadas ingiere el servidor ahora, para no pedirlas en el PC
- [ ] Dejar en el PC la lista de temporadas que le tocan, **en configuración**, no en un comentario
- [ ] Comprobar que ninguna temporada se recoge dos veces (en septiembre se duplicaron ocho federaciones)
- [ ] Regla escrita: cuando una temporada pasa al servidor, se quita del PC

## Objetivo 3 — La plataforma, contra el diseño

- [x] Elegir la primera pantalla: **la clasificación** (`2 · Competición`), que es la que más valor da y la que más enseña del sistema visual
- [x] Inventariar los datos reales que hacen falta para esa pantalla
- [ ] Implementar solo CyL, que es la implementación de referencia — **primera versión hecha el
  2026-11-04** en `/explorar/competicion/[id]` (clasificación, jornada y goleadores con datos reales
  del grupo 797 del canónico). **Terminada contra el prototipo el 04/11/2026**: tokens nuevos del
  sistema de diseño, tipografía Inter autoalojada, cabecera común del sitio, tabla responsiva con la
  primera columna fija, migas con el nombre corto real de la federación, estados vacío/parcial/carga y
  404 correcto bajo `Suspense`, y arreglado el fallo de goles reconstruidos mezclados de dos jornadas.
  Evidencia: [`SPEC-PANTALLA-2.md`](docs/plataforma-web/SPEC-PANTALLA-2.md) y
  [`DECISIONES.md`](DECISIONES.md) (decisiones 10-19); capturas en
  [`docs/plataforma-web/capturas/`](docs/plataforma-web/capturas/pantalla-2-clasificacion-3769-2026-11-05.png).
  También hechos: el **tema claro/oscuro** (cookie resuelta en servidor, control en la cabecera; sólo
  en rutas migradas) y la forma **V-E-D**. Faltan de la primera tanda: la **pantalla Jornada**, el
  **acta del partido** y la **ficha de equipo**. Quedan para después las demás pestañas y pantallas, el
  conmutador Casa/Fuera (necesita proyección por condición) y el interruptor de densidad.

**Primera tanda decidida por David (04/11/2026): cuatro pantallas** — clasificación (hecha), jornada,
acta del partido y ficha de equipo. El resto de las 22 se añade después, con la misma base; el
prototipo completo es la referencia, no la primera entrega.

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

## Decisión de David (2026-11-04, coordinación)

**¿Se reutiliza `apps/web` o se rehace contra el diseño?**

- **El diseño manda**: la capa visual se rehace contra el prototipo de `diseno/prototipo` y el sistema de diseño. No se arrastra la interfaz vieja.
- **Lo que sí se reutiliza**: contratos de API, consultas, la ingesta y todo lo que no sea presentación. Si `apps/web` tiene lógica de datos que funciona, se conserva.
- Criterio: si un componente viejo ahorra más de lo que estorba, se adapta al sistema de diseño; si no, se rehace. Se decide componente a componente, no en bloque.

## Decision de coordinacion (2026-11-04, tarde) — panel con progreso de CyL

David quiere ver en el dashboard, sin preguntar:

1. **Estimación de lo que queda para terminar CyL entero**: cuántas competiciones
   hay, cuántas están completas y qué porcentaje falta. En números y en una frase.
2. **Desglose por temporada**: por cada temporada, qué está hecho y qué falta.
3. **Ritmo de peticiones en ese momento**, separado entre lo que hace el PC y lo
   que hace el servidor. Un número por minuto, no una media histórica.

Se publica en `F:\Proyectos\facylf\metricas-facylf.json` con esta forma, y el
panel lo lee (nada de que el panel calcule: el proyecto lo mide).

```json
{"cyl": {"competiciones_total": 0, "completas": 0, "porcentaje": 0},
 "temporadas": [{"temporada": "2025-26", "hecho": 0, "total": 0}],
 "ritmo": {"pc_por_min": 0, "servidor_por_min": 0, "medido": "AAAA-MM-DDTHH:MM"}}
```

**Publicado el 04/11/2026.** El generador es `scripts/metricas-facylf.mjs`; la semántica exacta de
cada número (qué es una competición, cuándo está completa, de dónde sale el ritmo y qué pasa si una
fuente falla) está en [`docs/plataforma-web/METRICAS-PANEL.md`](docs/plataforma-web/METRICAS-PANEL.md).
El fichero existe en la raíz con datos reales y **se refresca cada 5 minutos** con la tarea programada
«FACyLF metricas panel» (autorizada por David el 04/11/2026; escritura atómica temporal + rename).

## Decision de coordinacion (2026-11-04, tarde) — otras dos decisiones

- **Forma del equipo**: se usa **V-E-D** (Victoria/Empate/Derrota) en la aplicación,
  que es lo que entiende cualquiera. El prototipo mezcla V-E-D y G-E-P; se unifica a V-E-D.
- **Tema claro/oscuro**: **sí entra** en esta tanda. El sistema de diseño ya lo tiene.

**Hecho el 04/11/2026.**

- **V-E-D**: `lib/forma-equipo.ts` es la única traducción (`G→V`, `E→E`, `P→D`); el dato de dominio y
  las consultas siguen en `G/E/P`. Se aplica en la clasificación (cabecera `V-E-D`, insignias V/E/D y
  palabra accesible), en `Racha`, en la ficha de equipo y en las actuaciones de jugador. Los
  **recuentos** (`G`, `E`, `P` de ganados/empatados/perdidos en columnas numéricas) se quedan como
  estaban: son números, no la forma.
- **Tema**: cookie `tema=claro|oscuro` leída en el servidor; `<html data-tema>` correcto en el primer
  HTML (sin parpadeo); botón accesible en la cabecera (44×44) que alterna y persiste; axe sin serias
  ni críticas en claro y en oscuro en la pantalla nueva. **Se aplica sólo a las rutas migradas**
  (`/explorar…`): `proxy.ts` deja la ruta y en las páginas viejas se fuerza claro y no se ofrece el
  botón, porque usan colores literales (deuda previa de `DESIGN.md` §2) y el oscuro las dejaba
  ilegibles. El orden de foco coincide con el visual (logo → Explorar → tema → buscador).

## Revisión de David (2026-11-05) — siete correcciones de la pantalla 2

1. **Escudos de club** en clasificación, fichas y jornadas, desde `core.club_asset`, con respaldo
   determinista si falta.
2. **Escudo de la federación** en la cabecera de la competición en vez de las siglas; recolectado del
   portal oficial y guardado con su origen.
3. **Zonas**: Liga Nacional Juvenil de CyL = 1 asciende y **3 descienden** (no 2). Regla fijada en
   `core.reglamento_grupo` (migración 0055) y probada con el grupo 797/3769. La fase de ascenso no se
   inventa hasta conocer sus puestos en las bases.
4. **Sin textos internos** (`DOCTRINA-CALIDAD.md` §8): fuera «zonas según…», «Sobre estos datos»,
   explicaciones del estado vacío y el pie con política de temporadas.
5. **Menores** (`DOCTRINA-CALIDAD.md` §9): nombres publicados (consentimiento de la federación);
   **fotos no**. Se actualizan `CLAUDE.md`, `AGENTS.md` y `SEGURIDAD-OPERACION.md` §5.
6. **Se sigue con las páginas del prototipo**, una a una; primera tanda: clasificación (hecha),
   jornada, acta del partido y ficha de equipo.
7. **Registro de usuarios**: diseño preparado (entrar/crear cuenta y acceso desde la cabecera) para
   favoritos, horarios, resultados y avisos; el backend vendrá después.

Regla de texto que queda escrita: de cada texto de la interfaz, **¿le sirve al cliente para decidir o
actuar?** Si no, se borra.
