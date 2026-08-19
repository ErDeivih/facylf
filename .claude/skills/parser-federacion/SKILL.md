---
name: parser-federacion
description: Formato real de los ficheros de calendario, clasificación y jornada que publica la Federación de Fútbol de Castilla y León (rfcylf.es), con las trampas ya identificadas. Úsala siempre que toques cualquier cosa relacionada con leer, parsear, importar o validar datos de la federación — incluye los ficheros .xls de calendario y clasificación, el HTML de NFG_CmpJornada, los nombres de equipo, o los tests de esos parsers. Consúltala también si vas a escribir un parser nuevo para otra categoría o provincia, porque el formato se repite.
---

# Parsers de la federación (rfcylf.es)

## Lo primero, y es importante

**Los ficheros `.xls` no son Excel.** Son HTML con extensión cambiada, en **ISO-8859-1**
(latin-1), con saltos CRLF. Si los abres con una librería de Excel, fallan. Si los lees
como UTF-8, se rompen las tildes y la ñ.

```python
d = open(ruta, encoding='latin-1').read()
soup = BeautifulSoup(d, 'lxml')
```

En TypeScript: `iconv-lite` para decodificar y `node-html-parser` o `cheerio` para el DOM.

Esto es una ventaja enorme: son endpoints de descarga estables, mucho más fiables que
raspar el HTML de la página, que cambia con cualquier retoque de diseño. **Prefiere
siempre el `.xls` sobre la página.**

## Calendario (`Calendario.xls`)

Confirmado con el fichero real de 1ª División Provincial de Juveniles, Primera –
Salamanca, 2026/27. Está en `datos-ejemplo/`.

Al extraer el texto y quedarte con las líneas no vacías, sale una secuencia plana:

```
Calendario de competiciones
Primera vuelta
Jornada 1
(20-09-2026)
Cabrerizos C.F.
-
C.D. Cristo Rey Barrio Vidal
C.D. Ribert
-
C.D. Guijuelo
...
Jornada 2
(27-09-2026)
...
```

El algoritmo que funciona:

```python
partidos, jornada, fecha, i = [], None, None, 0
while i < len(lineas):
    l = lineas[i]
    if m := re.match(r'^Jornada\s+(\d+)$', l):
        jornada = int(m.group(1))
        f = re.match(r'^\((\d{2})-(\d{2})-(\d{4})\)$', lineas[i+1])
        fecha = f'{f[3]}-{f[2]}-{f[1]}' if f else None
        i += 2
        continue
    if l == '-':                       # el guión es el separador, y el ancla
        partidos.append(dict(j=jornada, fecha=fecha,
                             local=lineas[i-1], visitante=lineas[i+1]))
        i += 2
        continue
    i += 1
```

**La clave**: no intentes leer filas de tabla. El `<td>` del guión central es el único
punto fiable; local y visitante son la línea de antes y la de después.

### Trampas del calendario

- **Las fechas de jornada son siempre domingo.** Es la fecha de la jornada, no la del
  partido. Muchos juveniles y todas las categorías inferiores juegan el sábado. Guarda
  esa fecha como `fecha` de la jornada y deja `partidos.fecha` abierta a corregirse
  cuando aparezcan los horarios reales.
- **Los sufijos de filial van entre comillas dobles**: `C.D. Munibar Pizarrales "B"`,
  `C.D. Navega "B"`, `Unionistas de Salamanca C.F. "C"`. Consérvalos en `nombre_fed` y
  normaliza aparte (ver abajo).
- **Las jornadas no son semanas consecutivas.** En 26 jornadas hay 8 fines de semana sin
  liga. No calcules la fecha de la jornada N sumando semanas: léela del fichero.

## Clasificación (`Clasificacion_Excel.xls`)

**Aviso: este parser no está cerrado y no puedes cerrarlo con el fichero de ejemplo.**

El fichero de `datos-ejemplo/` es de pretemporada: todos los valores son `0`, así que no
se puede distinguir qué columna es cuál por su contenido. La estructura observada:

1. Repite el bloque de la jornada (mismo formato que el calendario)
2. Cabeceras agrupadas: `Equipos`, `Partidos`, `Goles`, `Últimos`, `Sanción`
3. Cabeceras de columna: `Equipos`, `Puntos`, `J.`, `G.`, `E.`, `P.`, `F.`, `C.`, `Puntos`
4. Filas: un valor, el nombre del equipo, y 9 numéricos

`Puntos` aparece dos veces (uno es la sanción). **No adivines el orden**: en cuanto haya
una jornada jugada, coge el fichero real, compáralo con la clasificación de la web y
fija el mapeo con un test. Hasta entonces, marca el parser como `@experimental` y no lo
uses para escribir en producción.

En realidad, para la clasificación **no hace falta parsear nada**: se calcula desde
`partidos` con la vista materializada de `PROYECTO.md` §4. Usa el fichero sólo para
**verificar** que tu cálculo coincide con el oficial. Si no coincide, casi siempre es
una sanción de puntos que la federación aplicó y tú no tienes.

## Normalización de nombres de equipo

La federación no es consistente consigo misma. En el `.xls` de calendario aparece
`C.D. Munibar Pizarrales "B"` y en el PDF de la cuadrícula el mismo equipo es
`C.D. Munibar Pizarrales`.

Guarda siempre las dos formas:
- `equipos.nombre_fed` — literal, tal cual viene. Es la clave para hacer match.
- `equipos.nombre` — para mostrar.

Para comparar, normaliza: minúsculas, quita tildes, quita prefijos
(`C.D.`, `C.D.M.`, `U.D.`, `C.F.`, `S.D.`, `A.D.`, `R.S.`), quita comillas y puntuación.

```ts
export const normaliza = (s: string) => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(c\.?d\.?m?\.?|u\.?d\.?|c\.?f\.?|s\.?d\.?|a\.?d\.?|r\.?s\.?)\b/g, '')
  .replace(/[^a-z0-9]/g, '');
```

**Ojo**: el sufijo de filial se pierde con esa normalización, así que `Pizarrales "B"` y
`Pizarrales` colisionan. Trátalo aparte: extrae el sufijo (`"B"`, `"C"`) antes de
normalizar y compáralo por separado. Dos equipos del mismo club en el mismo grupo es raro
pero pasa en categorías bajas.

## Validación obligatoria de todo parser de calendario

Cuatro comprobaciones que detectan casi cualquier fallo. Ponlas como test:

```ts
const n = equipos.length;
assert(partidos.length === n * (n - 1));        // 14 equipos → 182 partidos
assert(new Set(partidos.map(p => `${p.local}|${p.visitante}`)).size === partidos.length);
for (const j of jornadas) {                      // nadie juega dos veces por jornada
  const vistos = new Set();
  for (const p of partidosDe(j)) {
    assert(!vistos.has(p.local) && !vistos.has(p.visitante));
    vistos.add(p.local); vistos.add(p.visitante);
  }
}
assert(cuentaPartidosPorEquipo.every(c => c === 2 * (n - 1)));
```

Si además tienes el **PDF de la cuadrícula** (filas = casa, columnas = fuera, celda =
jornada), es una segunda fuente independiente: reconstruye los 182 emparejamientos desde
la rejilla y compáralos con los del `.xls`. Ya se hizo con el fichero de ejemplo y
coincidieron al 100%. Es el mejor test de regresión que vas a tener.

## Página de jornada (NFG_CmpJornada)

Es la que hay que mirar el fin de semana para los resultados en curso. Parámetros:

```
cod_primaria=1000120
CodCompeticion=…   CodGrupo=…   CodTemporada=22   CodJornada=…
Sch_Codigo_Delegacion=…
```

**Pendiente de confirmar**: las URLs exactas de los botones "Calendario Excel" y
"Clasificación Excel" de esa página. Se sacan con F12 → Red → pulsar el botón. Si el
usuario aún no te las ha dado, **pídeselas antes de escribir este parser**; sin ellas
estarías adivinando.

`CodTemporada=22` corresponde a 2026/27, así que la numeración parece arrancar en
2004/05. Confírmalo con otra temporada antes de fiarte de la fórmula.
