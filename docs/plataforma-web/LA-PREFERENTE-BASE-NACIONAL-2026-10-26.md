# La Preferente como base de TODAS las federaciones, la RFEF como fuente nueva y otras webs — 26/10/2026 (noche)

> Claude, 26/10/2026, 21:30.
> David: «continúa haciendo tú la tarea y decidiendo tú, me fío. Usar La Preferente como base para todas las
> federaciones, no sólo Cataluña o CyL; buscar también si hay más páginas de este tipo».
> Sigue a `LA-PREFERENTE-Y-CATALUNA-2026-10-26.md`. Sin commits. Migraciones nuevas escritas y probadas en una copia,
> **no aplicadas** en la base real.

## 1. Decisiones (las tomo yo, como pidió David)

| # | Decisión | Por qué |
|---|---|---|
| **D2** | **Sí a enseñar los datos de LP en la web**, marcados «Dato no oficial (La Preferente)». Se enciende cuando la web tenga la marca (encargo, paso 6). | Hoy la web es **privada** (sólo Tailscale, nunca Internet: `DESPLIEGUE-SERVIDOR.md`). Así David ve la web completa ya. |
| **D2-bis** | **Antes de abrir la web a Internet**, permiso escrito de LP. Si no lo dan, se apaga con un ajuste (`facylf.lp_publico`) y la web queda sólo con datos de federación. | En la UE, sacar y reutilizar una parte sustancial de una base de datos ajena es un riesgo legal (derecho *sui generis*). En privado, no hay distribución. |
| **D5** | El correo a LP lo **envía David** cuando quiera abrir la web: yo no envío mensajes en su nombre. Borrador en `ENCARGO-DEEPSEEK-2026-10-25.md`. | — |
| **D6** | **LP y Cataluña-FCF se quedan en el PC.** No van al servidor. | El servidor es un portátil con el cargador poco fiable, a carga ~14 y con recortes de CPU (E0 200 %). No arranca el multideporte. Se revisa cuando CyL haya pasado al servidor y el cargador esté arreglado. |
| **D7** | **Sí al «acta provisional» de LP**, pero **sin meterla en `core`**: vistas que la dan sólo mientras el partido no tenga acta de la federación (migración 0054). | Si el importador escribiera actas de LP en grupos de la federación, dos fuentes se pisarían en el mismo grupo. Con vistas, `core` sólo tiene actas oficiales y la provisional desaparece sola cuando llega la buena. |
| **D8** | **La RFEF entra como fuente** (competiciones nacionales), con el mismo recolector PNFG. | Ver §2: es oficial, tiene actas y es la misma plataforma que ya leemos. |

Quedan como estaban: no hay commits ni push, no se borran personas huérfanas, y nunca se publican nombres de menores
(las vistas de 0054 los quitan).

## 2. Otras webs de este tipo (búsqueda del 26/10, noche)

| Web | Qué da | Veredicto |
|---|---|---|
| **RFEF — `resultados.rfef.es/pnfg` (= `marcadores.rfef.es/pnfg`)** | **Plataforma PNFG oficial, la misma que las territoriales** (`cod_primaria=1000120`), con actas. Todas las nacionales: 1.ª y 2.ª Federación, Copa del Rey y Copa Federación, femenino nacional, División de Honor juvenil, fútbol sala y playa. **Temporadas en el desplegable: 2026-27 → 1990-91 y 1946-47 → 1953-54.** | **SÍ, la mejor de todas.** No la teníamos. Alta preparada (`perfiles/rfef.json`, `recolector.rfef.config.json`, `config/federaciones-espana.json` → `nacionales`). La Tercera Federación y la Liga Nacional juvenil las llevan las territoriales, que ya se recogen. |
| La Preferente | Ver `LA-PREFERENTE-PLAN-2026-10-25.md` | **Sí: la base de todo** (este documento). |
| ceroacero / zerozero | Base de datos portuguesa. **De España, 629 competiciones de todos los deportes** (Andalucía 129); de base, casi nada | No: muy poco de España frente a LP (2.469 por temporada sólo de fútbol) |
| Prensa regional: eldeportivo.es (Tenerife), futbolaspalmas.com, PDF semanales de El Diario del AltoAragón, valenciabase.com, castellonbase.com | Marcadores de algunas categorías de su zona, en artículos o PDF; sin histórico ordenado | No: menos que la federación y sin estructura |
| Gobierno Vasco (`euskadi.eus`), deporte escolar | Resultados en PDF del fútbol **escolar** vasco (el de base en Euskadi es escolar, no federado), a veces con nombres | **Más adelante y sólo resultados** (los nombres son de menores). LP no da fichas en el País Vasco. |
| Wikipedia (CC BY-SA) y RSSSF | Clasificaciones históricas de las categorías regionales altas | Para contrastar el histórico anterior a 2010, si hace falta. Licencia limpia en Wikipedia. |
| Ya vistas el 25/10 (`FUENTES-ALTERNATIVAS-2026-10-25.md`) | BeSoccer/resultados-futbol, Futbolme, SofaScore, Flashscore, Transfermarkt | Siguen descartadas: legal, alcance o ambas cosas |

**Conclusión:**
- No hay otra La Preferente.
- Lo que más acelera ahora es **la RFEF**, que es oficial.
- **LP** sigue de base para todo lo demás.
- En el País Vasco, Extremadura y Canarias LP sólo da resultados. Ahí mandan las federaciones (ya en marcha) y, para la base vasca, el deporte escolar.

## 3. Qué he hecho

### LP para todas las federaciones

- **Fichas de todas las comunidades** (`scripts/multideporte/lapreferente-fichas.json`, nuevo formato):
  - Desde 2010-11.
  - Cataluña, sólo hasta 2024-25: lo de después lo da la FCF con actas.
  - Temporada en curso, sólo Madrid (su federación no publica actas) y las nacionales (hasta que entre la RFEF).
  - **Primero** van Cataluña, Madrid, Andalucía, Galicia y las nacionales (prioridad 60-69); el resto después (70-79). En cada tramo, de la temporada más reciente a la más vieja.
  - Todas van después de los ~21.700 calendarios, que son lo que da resultados y clasificaciones de toda España.
- **Sólo las fichas que aportan algo:** `scripts/lapreferente/elige-fichas.mjs`.
  - Excluye las competiciones de LP cuyo grupo de la federación ya tiene acta en el ≥ 90 % de los partidos jugados.
  - Las apunta en `excluidas` del JSON, que el adaptador lee cada minuto.
  - Con `--cola`, descarta en la cola las fichas ya encoladas de esas competiciones.
  - Con ~4.600 páginas al día no se pueden pedir todas; así se piden las que llenan huecos.
- **Nacionales → fuente `rfef`:** lo nacional de LP se empareja con la RFEF en cuanto se recoja. Mientras tanto entra como edición de LP y se aparta solo cuando llegue la RFEF. El importador ya acepta las fuentes de `nacionales` (`contexto.ts`).
- **Partido a partido** (`empareja.mjs` → `externo.lp_partido_match`, 0054): cada partido de LP queda casado con el suyo del canónico. Si el cruce se repite, se casan por orden de jornada.
- **Acta provisional** (0054): vistas `externo.acta_provisional_partido`, `_alineacion` y `_evento`.
  - Dan la ficha de LP de un partido **sólo** si:
    - no tiene acta de la federación;
    - `facylf.lp_publico = on`.
  - Con nombre NULL si LP la marca de menores.
  - La web (`facylf_lector`) sólo lee esas vistas: **ya no puede leer las tablas de `externo`** (0052 corregida y revocado en 0054).
- **Ciclo diario para todas:** `ciclo-lapreferente.ps1 -Todas` hace cinco pasos:
  1. `a-externo`;
  2. emparejado de todo;
  3. `elige-fichas`;
  4. para cada federación y temporada con competiciones sin contraparte, cola + importación con origen LP;
  5. vigía.

### Comprobado (copia con PostgreSQL 16 y 0001-0054)

| Comprobación | Resultado |
|---|---|
| Emparejado | 24 partidos casados |
| Acta provisional como `facylf_lector` sin `lp_publico` | 0 filas |
| Acta provisional con `lp_publico = on` | alineaciones y eventos del partido de prueba |
| `facylf_lector` leyendo `externo.lp_participacion` directamente | «permission denied» |
| Pruebas en el PC (LP, adaptador, emparejado, informes de federaciones y plan de flota) | **38 en verde** |
| Canónico | 207 de 208 (la que falla son las «muestras de oro», que no están en la copia) |

## 4. Encargo para DeepSeek (en este orden; sustituye al §4 del documento del 26/10)

1. **`pnpm db:migrar`** (aplica **0052, 0053 y 0054**). Comprobar:
   - `has_schema_privilege('facylf_publicador','externo','USAGE')`;
   - existen la política `web_sin_la_preferente` y la vista `externo.acta_provisional_partido`;
   - `facylf_lector` NO puede leer `externo.lp_participacion`.
2. **Parar el `lapreferente` viejo:** `scripts\multideporte\reiniciar-multideporte.ps1`. Sirve además para que `lapreferente-federado` coja ya el código de hoy.
3. **Adelantar el histórico de Cataluña:** `node scripts\lapreferente\prioriza-cola.mjs --aplica`.
4. **Pruebas:**
   ```
   node --test scripts/lapreferente/lapreferente.test.mjs scripts/lib/empareja-lapreferente.test.mjs scripts/multideporte/adaptadores/lapreferente-federado.test.mjs scripts/lib/informes-federaciones.test.mjs scripts/lib/plan-flota.test.mjs
   ```
   Deben salir 38 en verde. Y `pnpm --filter @facylf/canonico test`.
5. **Tarea diaria** «FACyLF La Preferente»: `ciclo-lapreferente.ps1 -Todas` a las 6:01, registrada como las de `registrar-tareas-plataforma.ps1` (`-StartWhenAvailable`, sin ventana).
   - Si el PC está apagado a esa hora, corre al encenderlo.
   - La primera vez, a mano, cuando haya calendarios (desde mañana), mirando la RAM: Node va con 1 GB como máximo.
6. **Web, L7** (David ya ha dicho que sí, §1):
   - **Marca «Dato no oficial · La Preferente»** en edición, grupo y partido cuando `core.competition_edition.origen = 'lapreferente'`. Enlace a `https://www.lapreferente.com/index.php?comp=<id>`; el id es `codigo_externo` sin «lp».
   - **Acta provisional:** en la página de partido, si no hay `core.match_report` y `externo.acta_provisional_partido` tiene el partido, enseñar alineaciones y eventos de las vistas `_alineacion` y `_evento` con el rótulo «Acta provisional (La Preferente) · no oficial».
   - Cuando esté: `alter role facylf_lector set facylf.lp_publico = 'on'`, `FACYLF_LP_PUBLICO=true` en el `.env` de la proyección, reproyectar y reiniciar la web.
   - **Antes de abrir la web a Internet** (no está previsto): permiso de LP o `alter role facylf_lector reset facylf.lp_publico`.
7. **RFEF (D8):** dar de alta la fuente `rfef` como se dieron de alta las provinciales el 16/10.
   - Perfil y configuración ya están: `perfiles/rfef.json` y `recolector.rfef.config.json`. La entrada va en `config/federaciones-espana.json` → `nacionales`; no en `fuentes`, para no cambiar las cuentas de 19+5 de las pantallas y la flota.
   - Pasos: catálogo, preparar y arrancar con `--perfil perfiles/rfef.json` **en el PC**.
   - **Primero 2026-27 y 2025-26**, después hacia atrás. A 6-8 s, una temporada nacional son unos días de PC.
   - Comprobar con un grupo de 2.ª Federación: partidos y actas.
8. **L6** (`persona_grupo` con el `J{id}` de LP): sigue para después.

## 5. Ficheros

- **Nuevos:**
  - `scripts/lapreferente/elige-fichas.mjs`
  - `infra/migraciones/0054-acta-provisional-de-la-preferente.sql`
  - `perfiles/rfef.json`
  - `recolector.rfef.config.json`
- **Cambiados:**
  - `scripts/lapreferente/a-externo.mjs` (nacionales → `rfef`; federaciones de `nacionales`)
  - `scripts/lapreferente/empareja.mjs` (partido a partido)
  - `scripts/lapreferente/cola-lp.mjs` (`--pendientes`)
  - `scripts/lapreferente/lib.mjs` (hosts de la RFEF)
  - `scripts/lapreferente/ciclo-lapreferente.ps1` (`-Todas`)
  - `scripts/lapreferente/lapreferente.test.mjs`
  - `scripts/multideporte/adaptadores/lapreferente-federado.mjs` y su prueba (fichas por comunidad, ventanas, tramos y excluidas)
  - `scripts/multideporte/lapreferente-fichas.json`
  - `packages/canonico/src/resolucion/contexto.ts` (lee `nacionales`)
  - `config/federaciones-espana.json` (`nacionales` → `rfef`)
  - `infra/migraciones/0052-…` (ya no da a la web permiso sobre las tablas de `externo`; **no aplicada**, así que se podía cambiar)
- **Aviso de herramienta:** un envío al PC del 26/10 a las 15:50 dejó versiones viejas de `a-externo`, `cola-lp` y `empareja`. Ahora está corregido y comprobado por huella (md5) fichero a fichero.
