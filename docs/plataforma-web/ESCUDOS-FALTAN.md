# Escudos de club: cuántos hay, cuántos faltan y por qué

Foto del **10/11/2026** sobre el canónico del PC (`127.0.0.1:5433`, contenedor `facylf-postgres`, base `facylf`).
Todo lo escribe un script de sólo lectura: [`scripts/claude/lista-escudos.mjs`](../../scripts/claude/lista-escudos.mjs).
La lista completa de clubes sin escudo está en [`tmp/escudos-faltan.csv`](../../tmp/escudos-faltan.csv) (901 filas).

## 1. Las cifras exactas

| Medida | Valor |
|---|---:|
| Clubes de Castilla y León en el canónico | **937** |
| Clubes de CyL con al menos un equipo-temporada | 933 (4 filas de club se crearon sin equipo) |
| Clubes con escudo vigente y binario | **36** (3,8 % de los 937) |
| Clubes sin escudo | **901** (897 con equipos + 4 sin ninguno) |
| Escudos guardados en total en el canónico | 36 (no hay escudos de ninguna otra federación) |
| Escudos vigentes distintos (por `sha256`) | 31: cuatro binarios están repetidos en dos o tres filas de club |
| Tamaño de los 36 binarios | 638.355 B (8.734 B el menor, 37.525 B el mayor) |
| Inscripciones (`core.team_entry`) de CyL | **38.457** |
| · con escudo en el club | **6.789** (17,7 %) |
| · sin escudo en el club | **31.668** |
| Equipos-temporada (`core.team_season`) de CyL | 10.417 (1.338 con escudo · 9.079 sin) |

Las cifras del encargo eran 933 clubes y 897 sin escudo: cuadran si se cuentan **sólo los clubes que tienen
algún equipo**. Las cuatro filas añadidas desde entonces son `C.D. COLEGIOS DIOCESANOS B/C/D/E` (52183-52186),
del bloque de La Preferente (id ≥ 46000) y todavía sin equipo: no son un club nuevo, son letras del mismo
club que ya existe dos veces más (80 y 39218).

## 2. Los 36 escudos se sirven bien: 36 de 36

Se recorrieron los 36 registros VIGENTES de `core.club_asset` (`tipo='escudo'`) y se comprobó, uno a uno: que
el binario no está vacío, que su **firma real** (primeros bytes) coincide con el `mime_type` declarado y que el
`sha256` recalculado es el guardado. Resultado: **36 correctos, 0 con problema**. Todos son PNG, con firma
`89 50 4E 47 0D 0A 1A 0A` y huella que cuadra. Lo que sirve hoy `/api/escudo/club/<clubId>` son ficheros
buenos, no basura.

| Club | Nombre | Bytes | Veredicto |
|---:|---|---:|---|
| 9 | C.D. La Virgen del Camino | 12385 | correcto |
| 16 | Ciudad Rodrigo C.F. | 11816 | correcto |
| 19 | U.D. Santa Marta de Tormes | 9878 | correcto |
| 80 | C.D. Colegios Diocesanos | 21150 | correcto |
| 81 | C.D. Guijuelo | 20576 | correcto |
| 82 | C.D. Numancia de Soria S.A.D. | 24089 | correcto |
| 83 | Unionistas de Salamanca C.F. | 9113 | correcto |
| 84 | Burgos C.F. S.A.D. | 18630 | correcto |
| 86 | Salamanca C.F. UDS | 18451 | correcto |
| 1474 | C.D. Carbajosa de la Sagrada | 24738 | correcto |
| 1475 | C.D. Cristo Rey Barrio Vidal | 15869 | correcto |
| 1478 | C.D. Munibar Pizarrales | 16607 | correcto |
| 1479 | C.D. Navega | 37525 | correcto |
| 1480 | C.D. Peñaranda de Bracamonte | 11935 | correcto |
| 1481 | C.D. Ribert | 18831 | correcto |
| 1482 | C.D. Villamayor | 8734 | correcto |
| 1487 | Alba de Tormes C.F. | 12760 | correcto |
| 1488 | Cabrerizos C.F. | 18484 | correcto |
| 1495 | C.D. Internacional Vista Alegre | 22657 | correcto |
| 1509 | C.D.F. Helmántico | 22820 | correcto |
| 1513 | S.D. Ponferradina S.A.D. | 19720 | correcto |
| 1514 | Victoria C.F. | 12623 | correcto |
| 1516 | C. y D. Leonesa S.A.D. | 24272 | correcto |
| 1517 | C.D. Parquesol | 16927 | correcto |
| 1518 | C.D. San Agustín Valladolid | 16611 | correcto |
| 1519 | C.D.I. de la Amistad Deltacinco | 26971 | correcto |
| 1520 | Gimnástica Segoviana S.A.D. | 11372 | correcto |
| 1521 | Puente Castro F.C. | 23079 | correcto |
| 1522 | Real Valladolid C.F. S.A.D. | 13767 | correcto |
| 1523 | U.D. Sur | 16771 | correcto |
| 5356 | C.D. Isoba | 19093 | correcto |
| 5524 | C.D.I. de la Amistad | 26971 | correcto |
| 15247 | Salamanca C.F. U.D.S. | 18451 | correcto |
| 15248 | C.D. Peñaranda Bracamonte | 11935 | correcto |
| 20979 | Gª Segoviana C.F. | 11372 | correcto |
| 21031 | Gimnástica Segoviana C.F. | 11372 | correcto |

Dos avisos que no son un problema de hoy:

- **El binario está repetido en cuatro grupos de filas**, porque son el mismo club partido en varias filas de
  `core.club`: Gimnástica Segoviana (1520, 20979, 21031), C.D.I. de la Amistad (1519, 5524), Peñaranda
  (1480, 15248) y Salamanca UDS (86, 15247). Por eso 36 filas = **31 clubes reales**.
- **La web decide «tiene escudo» por la existencia de la fila vigente**, sin mirar el binario
  (`fichas.ts`, `partidos.ts`, `calendario.ts`… hacen un `EXISTS`). Hoy coinciden fila y binario, pero si
  alguna vez se guarda una fila sin contenido la ficha pintaría un `<img>` roto en vez de las iniciales.
- El único registro **no vigente** de toda la tabla es el escudo JPEG de 20.936 B del club 16 (Ciudad Rodrigo),
  sustituido por el PNG actual: es un cambio de imagen, no un escudo perdido.

## 3. Los 901 clubes sin escudo: el reparto por causa

### 3.1. ¿Qué falta en la base?

| Causa | Clubes | Comentario |
|---|---:|---|
| No hay **ninguna fila** en `core.club_asset` para ese club | **901** | ni vigente ni caducada |
| Hay fila de escudo pero **no vigente** | 0 | el único no vigente (club 16) tiene además uno vigente |
| Hay fila vigente con **binario vacío** | 0 | imposible por esquema: `contenido bytea not null` (0017) |
| Hay binario guardado con **otro `tipo`** | 0 | imposible por esquema: `check (tipo in ('escudo'))` (0017) |
| **Total sin escudo** | **901** | |

Es decir: no hay ni un solo caso de «el fichero está pero no sirve» ni de «está guardado en otro sitio». **El
hueco es que la fila no existe**, y la pregunta útil es por qué no existe.

### 3.2. De los 901, ¿cuál es el motivo exacto?

Aquí hay dos niveles de evidencia, y el informe los separa a propósito:

| Motivo | Clubes | Evidencia |
|---|---:|---|
| El escudo existe en **otra fila del mismo club**, que comparte código de equipo con esta | **12** | **dura**: lo dice la federación (`core.team_entry.codigo_externo`) |
| El escudo existe en otra fila del mismo club, pero sólo coincide el **nombre** | **16** | débil: hay que mirarlo a mano |
| El escudo existe, pero las **siglas no encajan** del todo | **1** | muy débil: hay que mirarlo a mano |
| El club está partido en varias filas y **ninguna** tiene escudo | **345** | el hueco es real, pero se cierra con una sola descarga |
| **Fila única, sin hermano conocido: falta de verdad** | **527** | el hueco real, club a club |
| **Total** | **901** | |

Los **12 con evidencia dura** (el escudo ya está descargado; sólo hay que decidir si se copia a la fila
hermana o se fusionan las filas):

| Club sin escudo | Filas del mismo club que ya lo tienen |
|---|---|
| 6 Burgos C.F. Promesas | 84 |
| 5414 Burgos C.F. S.A.D. Femenino | 84 |
| 5352 C.D.I. de la Amistad Saborea | 5524 |
| 17 Júpiter Leonés | 1516 |
| 22587 Real Valladolid C.F. S.A.D. Femenino | 1522 |
| 22637 C.D. Parquesol Femenino | 1517 |
| 5533 C.D. COLEGIOS DIOCESANOS F | 80 |
| 12434 C.D.F. Helmántico - Gateway United | 1509 |
| 37931 Victoria C.F. Femenino | 1514 |
| 39218 CC.D. Colegios Diocesanos | 80 |
| 39253 C.D. Ribert CONDE DAVID | 1481 |
| 52187 C.D. COLEGIOS DIOCESANOS G | 80 |

Los **17 por nombre** (revisar a mano; 16 de ellos son filas con id ≥ 46000, del bloque de La Preferente, con
el nombre abreviado frente a la fila antigua): 46551 S.D. Ponferradina → 1513; 46553 Peñaranda Bracamonte →
1480/15248; 46554 Carbajosa de Sagrada → 1474; 46570 Santa Marta Tormes → 19; 46600 Burgos → 84; 46601 C.I.
Amistad → 5524; 46611 Unionistas Salamanca → 83; 46616 C.F. Salamanca UDS → 86; 46630 Gimnástica Segoviana →
1520/21031; 46633 Real Valladolid → 1522; 46634 C.D. Numancia Soria → 82; 46635 C.I. de la Amistad → 5524;
46670 La Virgen del Camino → 9; 52184/52185/52186 C.D. COLEGIOS DIOCESANOS C/D/E → 80; y el dudoso 37948 F.S.
Salamanca Unionistas F.S. → 83.

### 3.3. La causa de fondo: el club está partido en varias filas

No es un problema de escudos, es de identidad, y conviene decirlo con el número: **262 filas de club de CyL
comparten al menos un código de equipo con otra fila** (17 de ellas tienen escudo). El patrón se ve en los
nombres, que cambian con el patrocinador de cada temporada: `C.F.S. La Bañeza`, `C.F.S. La Bañeza Aqualia`,
`C.F.S. La Bañeza - Barber Shop J. Cortes`, `C.F.S. La Bañeza Burguer Teatro`, `C.F.S. La Bañeza Bar Esencia`
(5 filas, 1 club) o los cinco `C.D. Inter Sala` con patrocinador distinto. Con los escudos pasa lo mismo:
la descarga cae en la fila que aparecía en el HTML de ese grupo y las demás se quedan sin nada.

Tres datos más que condicionan cualquier arreglo automático:

- **152 filas de club (id ≥ 46000) no tienen ni un solo escudo.** Es el bloque que creó la importación de La
  Preferente: 136 de esos clubes tienen algún código `lp*` y sus 296 inscripciones son casi todas de esa
  fuente (268). Ahí están 16 de los 17 candidatos por nombre y 1 de los 12 por código.
- `municipio` y `provincia` están **vacíos en los 937 clubes** de CyL: no hay localidad con la que desambiguar
  dos «Burgos» o dos «Salamanca».
- de las 38.457 inscripciones de CyL, **2 no tienen `codigo_externo`**, así que el recolector de escudos
  (`escudos-desde-html.mjs`, que empareja por ese código) no las puede tocar.

## 4. ¿Lo publica el portal de la federación? (muestra y comprobación)

El hueco no es de la web: la web sirve lo que hay en `core.club_asset`. La pregunta es si el portal de la
RFCYLF publica el escudo de esos clubes y no se ha recogido.

**Lo que se intentó (10/11/2026, mañana) y lo que pasó:**

1. `NFG_VisEquipos` de dos equipos contestó **200 con HTML** (30.619 y 35.564 B) en las dos primeras
   peticiones del día. Esa página no lleva el escudo del club —sólo el logo de cabecera y un fondo genérico—,
   así que no responde a la pregunta.
2. A partir de ahí, el portal devuelve **200 con cuerpo vacío** a PowerShell, a Node y a Chrome sin ventana
   (más de una veintena de peticiones en total, tres de ellas espaciadas 8 s y todas con el `JSESSIONID` que
   el propio portal sirve). Chrome devuelve `<html><head></head><body></body></html>`. Una traída desde fuera
   acaba en **`NFG/NLogin?NSess=1`**: el portal **exige sesión** desde este cliente. No se ha intentado
   iniciar sesión ni esquivar nada.
3. **El host de imágenes sí publica escudos sin sesión**, y se comprobó sin ambigüedad: dos `fuente_url`
   guardadas devuelven `200 image/png` con **exactamente** los mismos bytes que hay en la base (19.093 B de
   C.D. Isoba y 11.935 B de Peñaranda), y un fichero inventado devuelve `404` limpio (no falsea un 200).

**La muestra de 5 clubes sin escudo:**

| Club | Situación | ¿Publica el portal su escudo? |
|---:|---|---|
| 46551 S.D. Ponferradina | variante de la fila 1513 | **sí, probado**: el binario de 1513 salió de `rfcylf.filesnovanet.es` |
| 5533 C.D. COLEGIOS DIOCESANOS F | comparte código de equipo con 80 | **sí, probado**: el escudo de 80 es del portal |
| 1 Arandina C.F. | fila única, 46 equipos | no verificable hoy: el portal pide sesión |
| 5240 A.D. Castilla Dueñas | fila única, 13 equipos | no verificable hoy: el portal pide sesión |
| 39251 Almanza F.S. Maquinaria 74 | fila única, 1 equipo | no verificable hoy: el portal pide sesión |

**Prueba indirecta de que el hueco es de recolección, no de la web ni del portal:** el grupo `24218968`
(juvenil) tiene **14 clubes y los 14 tienen escudo**, y 13 de esos escudos se observaron el mismo día (25/09);
el grupo `24218940`, del mismo día, tiene 4 de 16. Cuando el recolector de escudos pasa por el HTML de un
grupo, los clubes de ese grupo acaban con su escudo. Los 36 escudos actuales salieron de **dos tandas** (14 el
25/09 y 22 el 05/11) y sus 36 `fuente_url` son del propio portal (22 del CDN `filesnovanet`, 14 de
`www.rfcylf.es`). No hay ninguna muestra de que el portal deje de publicar el escudo de un club de CyL.

Un límite práctico para repetir la recolección: el archivo de HTML que usa `escudos-desde-html.mjs` (carpetas
`grupo-*` con las páginas de jornada) **no está** hoy en `descargas-federacion/recolector-local`: en las
temporadas revisadas (t11, t14, t19 y t22) hay 62, 62, 81 y 111 ficheros HTML y **ninguna carpeta `grupo-*`**;
son los catálogos de competición y las listas de grupos, sin jornadas. Para recolectar escudos hay que volver
a traer esas páginas, no se pueden sacar del archivo.

## 5. El registro de los que faltan

[`tmp/escudos-faltan.csv`](../../tmp/escudos-faltan.csv) — 901 filas (una por club sin escudo), separador `;`:

| Columna | Qué es |
|---|---|
| `club_id` | id de `core.club` |
| `nombre` | nombre canónico |
| `equipos` | equipos-temporada del club |
| `inscripciones` | inscripciones en competición (`team_entry`) |
| `causa` | estado de `core.club_asset` (`sin-fila-en-club_asset` para los 901) |
| `motivo` | el reparto de la tabla 3.2 |
| `hermanos_con_escudo` | filas del mismo club que ya tienen el escudo (`\|` si hay varias) |
| `hermanos_sin_escudo` | filas del mismo club, todas sin escudo |
| `codigos_equipo` | códigos `Codigo_Equipo` de la federación |

`tmp/` está en `.gitignore`, así que el CSV no se versiona: es un producto que se regenera con el script en
un segundo (`--sin-csv` si sólo se quieren los recuentos). Lo que sí queda versionado es este documento con el
reparto y los dos registros que importan (12 escudos que ya están en la base y los 40 huecos con más peso).

Los que más pesan en la web (por inscripciones) y son hueco real: **C.D. Linko** (79 equipos, 335
inscripciones), **C.D. Claret** (63/328), **C.D. Zona Norte** (47/308), **C.D. San Juanillo** (57/285) y
**C.D. San José** (58/284). Ahí es donde se nota la falta de escudo en las tablas. El anexo de abajo tiene los
40 primeros; los 527 están en el CSV.

### 5.1. Los 40 «falta de verdad» con más inscripciones

| Club | Nombre | Equipos | Inscripciones |
|---:|---|---:|---:|
| 5359 | C.D. Linko | 79 | 335 |
| 5303 | C.D. Claret | 63 | 328 |
| 5354 | C.D. Zona Norte | 47 | 308 |
| 5355 | C.D. San Juanillo | 57 | 285 |
| 1496 | C.D. San José | 58 | 284 |
| 5292 | Unami C.P. | 38 | 244 |
| 10 | C.D. Laguna | 42 | 238 |
| 1 | Arandina C.F. | 46 | 229 |
| 5198 | C.D. Unión Arroyo | 50 | 226 |
| 1503 | Betis C.F. | 38 | 223 |
| 1483 | C.D. Villares de la Reina | 50 | 219 |
| 5266 | C.D. Casco Viejo | 61 | 215 |
| 5217 | Atlético Pinilla | 36 | 203 |
| 5264 | C.D. Arces | 34 | 197 |
| 5184 | C.D. Juventud del Círculo Católico | 44 | 194 |
| 5353 | C.D. San Telmo | 39 | 191 |
| 3 | Atlético Bembibre | 32 | 190 |
| 1477 | C.D. Jai Alai-Bolívar | 45 | 186 |
| 5306 | C.D. Cuatrovientos | 37 | 181 |
| 5373 | C.D.F. San Antonio | 39 | 180 |
| 5334 | C.D. Don Bosco | 34 | 179 |
| 5274 | C.D. Aranda Riber | 46 | 177 |
| 5 | Atlético Tordesillas | 31 | 173 |
| 5272 | Vadillos C.F. | 38 | 172 |
| 5364 | León C.F. | 36 | 172 |
| 5224 | C.D.F. San Andrés | 36 | 169 |
| 5374 | Atlético Parquesol C.F. | 36 | 167 |
| 5261 | C.D. Boecillo | 39 | 165 |
| 5379 | C.D. La Amistad 2000 | 30 | 164 |
| 5290 | C.D. Cantalejo | 26 | 164 |
| 28249 | P. Casa Social Católica | 26 | 163 |
| 5389 | C.D. Tudela | 40 | 160 |
| 5330 | Atlético de Laguna | 38 | 158 |
| 5378 | C.D. Amor de Dios de Zamora | 30 | 158 |
| 5371 | C.D.D. Base Villamuriel | 36 | 157 |
| 5377 | U.D. Pinilla Duero | 31 | 155 |
| 5397 | C.D. La Morenica Aldebi | 36 | 153 |
| 5233 | Atlético Aguilar | 29 | 153 |
| 5391 | Atlético Pincia | 33 | 148 |
| 1486 | Sporting Carbajosa | 32 | 146 |

## 6. Cómo regenerar todo

```powershell
# Recuentos + CSV en tmp/escudos-faltan.csv (sólo lectura: la sesión de psql se abre en read-only)
node scripts/claude/lista-escudos.mjs

# Falla si los recuentos dejan de cuadrar (con + sin = total, escudos = clubes con escudo…)
node scripts/claude/lista-escudos.mjs --exigir

# Sólo el resumen, sin escribir CSV, o el informe en JSON
node scripts/claude/lista-escudos.mjs --sin-csv
node scripts/claude/lista-escudos.mjs --json

# Pruebas de las piezas puras (firma de imagen, nombre, causa): 8 pruebas
node --test scripts/claude/lista-escudos.test.mjs
```

El script abre `default_transaction_read_only = on` en la sesión de `psql` y sólo lanza `SELECT`: no toca la
base, ni la web, ni las migraciones. Las consultas que se usaron para el diagnóstico están en
`tmp/escudos/` (`01-conteo.sql` … `12-lp.sql`).

## 7. Límites de este informe

- **La comprobación en vivo del portal queda a medias** y así se dice: los 3 clubes de la muestra con fila
  única no se han podido ver hoy porque el portal exige sesión. Los 2 casos con escudo en otra fila sí están
  probados, y el host de imágenes publica sin sesión.
- **El reparto por nombre es una heurística**, no una identificación: 17 clubes están como «el escudo ya está
  en otra fila» por parecido de nombre. Esos 17 hay que mirarlos a mano antes de darles el escudo.
- «Equipos» son `core.team_season` e «inscripciones» son `core.team_entry`: un equipo puede tener varias
  inscripciones (liga y copa), por eso 10.417 equipos son 38.457 inscripciones.
- No se ha recolectado ni guardado ningún escudo: las dos descargas de comprobación del host de imágenes se
  hicieron sólo para verificar sus bytes y no se guardaron. Y no se ha hecho `git commit` ni `push`.



## 8. Lo que se decidió ese mismo día: no se copian (10/11, 13:00)

Los dos coordinadores avisaron de que **los escudos son signos de cada club y pueden tener derechos**. Por eso esta
tarea NO se cierra copiando escudos: se cierra sabiendo cuántos faltan y por qué.

- A primera hora del 10/11 se copiaron **12 escudos** a los clubes hermanos de la tabla §3.2 (misma fila de club
  partida, evidencia del código de equipo de la federación). **Se revirtieron el mismo día**: se borraron las 12
  filas insertadas y hoy vuelve a haber **36 clubes con escudo** (los que ya venían). El SQL conservado
  (`scripts/claude/fija-escudos-hermanos.sql`) es ahora un registro de lo que se hizo y se deshizo, con «NO USAR».
- La decisión completa está en [`DECISIONES.md`](../../DECISIONES.md): **iniciales por defecto y escudo real sólo
  con permiso del club**; ni copiar de la federación ni recolectar del portal.
- Lo que sí queda de valor es el diagnóstico: **901 clubes sin escudo** (de 937), repartidos en 12 con evidencia
  dura de escudo en otra fila, 16 por nombre (heurística, a revisar a mano), 1 por siglas, 345 clubes partidos en
  varias filas y **527 de fila única sin escudo en ningún sitio**. El registro se regenera con
  `node scripts/claude/lista-escudos.mjs` y el CSV está en `tmp/escudos-faltan.csv`.
- Los 36 escudos existentes siguen verificados uno a uno (§2): 0 corruptos, todos PNG con huella que cuadra.
