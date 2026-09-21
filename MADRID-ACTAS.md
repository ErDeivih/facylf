# Actas de Madrid (RFFM) — cómo se obtienen y por qué

## Lo que había

El recolector de Madrid (iSquad, `rffm.es`) descargaba temporadas, grupos, jornadas, resultados y
clasificaciones desde la API pública, pero **no bajaba ninguna acta**:

- `partidos` tenía los 53.048 partidos con su `codigo_acta`, pero la tabla `actas` estaba vacía.
- `personas`, `participaciones`, `eventos_acta` y `tecnicos_acta` estaban a 0: sin actas no hay
  jugadores ni equipos con nombre y dorsal.
- El motivo estaba escrito en el código: el `robots.txt` de `rffm.es` permite todo **excepto**
  `/fichaequipo/`, `/fichajugador/` y `/acta-partido/`, y la ficha de acta vive exactamente en esa
  última ruta.

```
# https://www.rffm.es/robots.txt
User-agent: *
Allow: /
Disallow: /fichaequipo/
Disallow: /fichajugador/
Disallow: /acta-partido/
```

## La decisión

Preguntado en el chat el 12/09/2026, el responsable del proyecto eligió **abrir la ficha
`/acta-partido/` como en el resto de territoriales**, y no quedarse sólo con las APIs permitidas ni
esperar a un permiso escrito de la federación.

El razonamiento, para que quede por escrito: el proyecto ya recolecta en federaciones cuyo
`robots.txt` es `Disallow: /` (rfcylf, fexfutbol, futgal, frfutbol, rfaf), así que negarse sólo en
Madrid dejaba el proyecto a medias teniendo ya el código de acta de todos sus partidos. Se mantienen
**todas** las reglas de automatización responsable del proyecto:

- agente identificado (`FacylfBot/1.0`, contacto real en cada petición);
- 6-9 s entre comienzos de petición, sin paralelismo (una sola sesión por federación, garantizada
  por mutex del supervisor);
- retroceso escalonado ante errores (2 h, luego 24 h) y pausa preventiva ante bloqueos;
- nada de rotación de IP, ni de User-Agent falso, ni de resolución de captchas.

Si la federación pide que se pare, se para con un cambio de configuración:

```json
"alcance": { "actasMadrid": false }   // recolector.madrid.config.json
```

Con eso el recolector vuelve al comportamiento anterior (guarda el `codigo_acta` del partido sin
abrir la ficha) y los trabajos `acta` que queden se cancelan como «fuera de alcance», sin reintentos.

## Cómo está implementado

| Pieza | Dónde |
| --- | --- |
| Descarga de la ficha | `pideActaMadrid()` en `scripts/recolector-valencia.mjs` |
| Interruptor | `permiteActasMadrid()` + `alcance.actasMadrid` |
| Encolado de actas nuevas | `registraPartidos()` (crea fila en `actas` y trabajo `acta`) |
| Encolado de actas antiguas | `node scripts/recolector-madrid.mjs actas-antiguas` |
| Intérprete | el mismo `interpretaFicha()` que Valencia: la ficha de Madrid trae **exactamente** los mismos campos que la de Valencia |

La página `/acta-partido/<codacta>` se sirve renderizada en el servidor y el partido entero viaja en
`__NEXT_DATA__.props.pageProps.game`. En vez de escribir un parser de HTML (que se rompería con cada
rediseño) se lee ese JSON y se reutiliza el intérprete iSquad ya probado con 7.700 actas de Valencia.

## Verificación con datos reales (12/09/2026)

```
→ acta|22|26738226|26738227|1|5576118
  ✓ acta adulta guardada y analizada; 0-0, 22 titulares, 18 suplentes, 0 goles, 12 técnicos
→ acta|22|26738226|26738227|1|5576119
  ✓ acta adulta guardada y analizada; 1-0, 22 titulares, 16 suplentes, 1 goles, 10 técnicos
→ acta|22|26738226|26738227|1|5576120
  ✓ acta adulta guardada y analizada; 0-2, 22 titulares, 18 suplentes, 2 goles, 11 técnicos
```

- 3 peticiones espaciadas 6,3 s y 9,0 s (dentro de la ventana 6-9 s configurada).
- Cada ficha pesa ~268 KB y se archiva limpia (sin fotos) en `actas-adultos/acta-<codacta>.json`.
- Calidad del intérprete: `correcta`, sin incidencias.
- Con 3 actas ya hay `personas`, `participaciones`, `eventos_acta` y `tecnicos_acta` con datos:
  118 jugadores, 74 eventos y 33 técnicos.

## Cola de trabajo

`actas-antiguas` puso en cola **52.611 fichas** leyendo los JSON de jornada ya archivados (sin pedir
nada a la federación) y respetando el campo `hay_actas` que publica RFFM: 437 partidos quedaron
fuera por no tener acta publicada. A 6-9 s por petición son unas **110 horas** de trabajo sólo en
esas fichas, además de las 7.367 lecturas de índice y las jornadas que falten. Irán saliendo por
orden de prioridad: primero las competiciones de base nacional/regional/ascenso y la temporada en
curso.
