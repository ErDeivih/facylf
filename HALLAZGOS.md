# Hallazgos de acceso a la federación (rfcylf.es)

Este documento registra lo aprendido sobre **cómo acceder a los datos** de la federación
para que no se pierda el trabajo. Es la memoria de "cómo se busca".

> Proyecto personal, sin ánimo de lucro. **Cadencia respetuosa, nunca ráfaga**, cliente
> identificado (`FacylfBot`), y **freno** si el sitio deja de responder. No se suplanta el
> navegador ni se resuelven captchas.

## 1. Los códigos CAMBIAN cada temporada (¡clave!)

- Competición/grupo/provincia/tipo: **todos los códigos cambian por año**.
- La **longitud** también cambia: antiguos = 3-5 dígitos (`401`, `12012`), actuales = 8
  (`24218932`). → Al parsear, aceptar **3+ dígitos**.
- Rango de temporadas disponibles: **8 (2012-13) a 22 (2026-27)**. `codTemporada = año − 2004`.

## 2. Endpoints descubiertos (con F12 → Red)

| Qué | Endpoint | Notas |
|---|---|---|
| Página de una **temporada** | `PNFG/NPcd/NFG_CmpJornada_Exec?cod_primaria=1000120&codtemporada=N&cod_agrupacion=&Sch_Codigo_Delegacion=D&Sch_Tipo_Juego=` | **GET que SÍ filtra por temporada.** |
| Desplegable de **competiciones** | dentro del HTML de `NFG_CmpJornada_Exec` (un `<select>` con las competiciones de esa temporada) | `competicionesDeSelect` lo lee. |
| **Grupos** de una competición | `NFG_CmpJornada_Exec`? No: `NFG_POR_Lst_Competiciones_Grupos?codcompeticion=X&N_Ajax=1` | **AJAX** (GET con `N_Ajax=1`). `parseaGrupos` lo lee (devuelve `<select name=grupo>`). |
| Jornada / resultados | `NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=X&CodGrupo=Y&CodTemporada=T&CodJornada=J` | `parseaJornada`. |
| Calendario | `NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=T&codcompeticion=X&codgrupo=Y` (+`excel=1&NPcd_File=1` para el `.xls`) | `parseaCalendario`. |
| Clasificación | `NFG_VisClasificacion?…` (+`excel=1`) | |
| Acta | `NFG_CmpPartido?cod_primaria=1000120&CodActa=X&cod_acta=X` | `parseaActa`. |

**¡Importante!** `NFG_Mov_LstCompeticiones?codtemporada=N` **IGNORA la temporada** (devuelve
siempre la actual). Para el histórico hay que usar **`NFG_CmpJornada_Exec?codtemporada=N`**.

## 3. El histórico NO se ve por HTTP puro → Selenium (ventana REAL)

- El histórico lo puebla **JS** tras **cambiar la temporada en el desplegable**.
- **El endpoint `_Exec` por GET directo devuelve vacío** para temporadas históricas (solo
  la actual se ve). El dato se renderiza solo con la interacción real.
- **Selenium con `--headless` NO puebla** el histórico (la web lo detecta). Hay que usar
  **ventana real** (quitar `--headless`).
- El **HTTP puro dispara la compuerta anti-bot** ("no se ha aceptado el cookie" / botnet)
  y puede **bloquear la IP**. Selenium (navegador real) **no** dispara esa compuerta.
  → Para el histórico, **Selenium**; para lo que el HTTP sí hace bien (grupos), HTTP
  **muy despacio**.

## 4. Códigos de delegación (confirmados del desplegable)

| Código | Delegación |
|---|---|
| 1000 | Sede Central (regional/nacional) |
| 1002–1010 | **Ávila, Burgos, León, Palencia, Salamanca, Segovia, Soria, Valladolid, Zamora** |
| 9636101 | Delegación Comarcal de El Bierzo |

(¡No era `1001–1009`: era desfasado en +1.)

## 5. Estructura de las competiciones (aportada)

- **Provincial**: un grupo por provincia (1ª, 2ª, 3ª…).
- **Regional cadete / infantil**: grupos Primera y Segunda.
- **Regional juvenil (Recoletas)**: A y B. + Liga Nacional (un grupo).
- **Fases de ascenso**: grupos de 3 equipos a final de temporada.
- **Aficionados regional**: A y B. **Tercera**: un solo grupo.
- Modalidad: 1 Futbol-11, 2 Futbol-7, 3 Futbol Sala, 4 Futbol-8, 5 Futbol Playa.
- Tipo: 1 Competiciones Federadas, 11201710 Competiciones No Oficiales.

## 6. Flujo de trabajo actual

1. **Volcar competiciones por temporada** (Selenium ventana real cambios en desplegable):
   ```bash
   node scripts/selenium-html.mjs 22 18 8 …   # escribe html-<temp>.html
   ```
2. **Extraer competiciones** de los dumps → `competiciones-por-temporada.json`:
   ```bash
   pnpm catalogo-historico
   ```
3. **Grupos de cada competición** (HTTP lento, reanudable, `--continuo`):
   ```bash
   pnpm descubrir-grupos --continuo --max 8 --pausa 6000 --cada-ciclo 60000
   ```
   → llena `catalogo.json` (temporada + competición + grupo + provincia).
4. **Jornadas** (Selenium ventana real, de la más reciente a la antigua):
   ```bash
   node scripts/selenium-jornadas.mjs
   ```
   → guarda `{slug}-jornada-{j}.html` (lo lee `parseaJornada`).
5. Reconstruir / web:
   ```bash
   pnpm reconstruir --slug <slug>
   ```

## 7. Gotchas

- **BOM**: PowerShell añade un BOM a los JSON → quitarlo al leer (`leerJson`).
- **Mojibake** en nombres (latin/UTF-8): los códigos/valores son fiables; los nombres
  pueden llevar acentos rotos (cosmético, se repara con iconv donde es recuperable).
- **0 bytes = freno**: no reescribir; en el worker esperar y reanudar.
- La web **comparte** `descargas-federacion/` con la ingesta; los ficheros de Selenium
  entran en `descargas-federacion/selenium/`.

## Estado actual (resumen)

- Comando de trabajo en `F:\EspacioCodigo\facylf`.
- Catálogo: se ha llenado la **temporada 22** (grupos correctos); el `--continuo` va hacia
  atrás por las otras temporadas.
- Web: multi-competición (lee `catalogo.json` + reconstruye).
