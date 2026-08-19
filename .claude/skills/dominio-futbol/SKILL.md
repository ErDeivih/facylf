---
name: dominio-futbol
description: Reglas de negocio del fútbol federado de Castilla y León — cómo se calcula una clasificación, el orden exacto de desempates, qué fines de semana hay parón y por qué, festivos de Salamanca de la temporada 2026/27, y cómo se decide entre el resultado oficial y el que manda la gente. Úsala siempre que trabajes en packages/dominio, en clasificaciones, tablas, rachas, desempates, calendarios, descansos, festivos, o en la lógica de confianza de los resultados en vivo. Consúltala antes de escribir cualquier cálculo sobre puntos o posiciones.
---

# Reglas del dominio

Todo esto vive en `packages/dominio`, sin dependencias de Supabase ni de Next. Se prueba
solo y en milisegundos.

## Clasificación

Victoria 3, empate 1, derrota 0. Lo interesante son los desempates.

**Orden de desempate** (reglamento habitual en Castilla y León — confírmalo con las bases
de la competición del año, que a veces cambian):

1. Puntos
2. **Enfrentamiento directo** entre los empatados: primero puntos del mini-grupo, luego
   diferencia de goles de esos partidos entre ellos
3. Diferencia general de goles
4. Goles a favor
5. Sorteo

**La trampa**: el paso 2 sólo tiene sentido cuando **todos** los equipos empatados se han
enfrentado ya entre sí las veces que marca el calendario. A mitad de temporada, con una
sola vuelta jugada, el enfrentamiento directo es incompleto y no se aplica. Y con tres o
más equipos empatados hay que construir el mini-grupo entero, no comparar de dos en dos.

Implementación recomendada: ordena por puntos, agrupa los empatados, y para cada grupo de
tamaño ≥ 2 comprueba si el mini-grupo está completo. Si lo está, reordena por él; si no,
salta al paso 3.

```ts
function desempata(grupo: Equipo[], partidos: Partido[]): Equipo[] {
  if (grupo.length < 2) return grupo;
  const entreEllos = partidos.filter(p =>
    jugado(p) && grupo.some(e => e.id === p.localId) && grupo.some(e => e.id === p.visitanteId));
  const esperados = grupo.length * (grupo.length - 1);   // ida y vuelta
  if (entreEllos.length < esperados) return porDiferenciaGeneral(grupo);
  return porMiniGrupo(grupo, entreEllos);
}
```

**Sanciones**: la federación resta puntos por alineación indebida o incomparecencia. Eso
no sale de los resultados, así que una clasificación calculada puede no cuadrar con la
oficial. Deja una columna `sancion` en la tabla de equipos por competición, por defecto 0,
y réstala al final. Cuando el cálculo no coincida con el oficial, mira ahí primero.

**Incomparecencias**: se anotan como 0-3 (o 3-0) y suelen llevar sanción aparte. Trátalas
como partido normal, la sanción va por su lado.

## Racha

Los últimos 5 partidos **jugados**, en orden cronológico, no por jornada. Con partidos
aplazados el orden de jornada miente: un equipo puede tener jugada la J20 y pendiente la
J14.

## Calendario y descansos

Una temporada de 14 equipos son 26 jornadas, pero se reparten sobre **34 fines de semana**.
Los 8 huecos no son errores del parser: son parones reales.

Un fin de semana sin partido puede serlo por tres motivos distintos, y al usuario le
importa la diferencia:

| Motivo | Cuándo |
|---|---|
| **Parón de liga** | no hay jornada para nadie |
| **Descansa tu equipo** | hay jornada, pero con número impar de equipos alguien libra |
| **Fuera de temporada** | antes de la J1 o después de la última |

Con 14 equipos (par) nunca hay descanso individual: todos los huecos son parones.

Agrupa siempre por **fin de semana (sábado + domingo)**, no por día. La federación fecha
las jornadas en domingo pero muchos partidos se juegan el sábado.

## Festivos de Salamanca 2026/27

Explican casi todos los parones. Están confirmados contra el calendario real de la
1ª Provincial Juvenil: los 8 parones caen en 6 de estas fechas.

```ts
export const FESTIVOS_2026_27 = [
  ['2026-09-08', 'Virgen de la Vega · Ferias y Fiestas de Salamanca'],
  ['2026-10-12', 'Fiesta Nacional'],
  ['2026-11-01', 'Todos los Santos'],
  ['2026-12-06', 'Día de la Constitución'],
  ['2026-12-08', 'La Inmaculada'],
  ['2026-12-25', 'Navidad'],
  ['2027-01-01', 'Año Nuevo'],
  ['2027-01-06', 'Reyes'],
  ['2027-02-09', 'Martes de Carnaval'],
  ['2027-03-21', 'Domingo de Ramos'],
  ['2027-03-25', 'Jueves Santo'],
  ['2027-03-26', 'Viernes Santo'],
  ['2027-03-28', 'Domingo de Resurrección'],
  ['2027-04-05', 'Lunes de Aguas'],          // tradición salmantina, no festivo oficial
  ['2027-04-23', 'Villalar · Día de Castilla y León'],
  ['2027-05-01', 'Fiesta del Trabajo'],
  ['2027-06-12', 'San Juan de Sahagún · patrón de Salamanca'],
];
```

Para asociar un festivo a un fin de semana, mira la ventana **viernes a martes**. Sin
ampliar hasta el martes, el Carnaval (martes 9 de febrero) no se asocia al parón del
6-7 de febrero, que es justo el que explica.

Estos festivos son los habituales de Salamanca capital y Castilla y León. El calendario
laboral de 2027 no estaba publicado cuando se escribieron: **son orientativos y deben
poder editarse desde la interfaz**, no estar clavados en el código como verdad.

Semana Santa 2027: Domingo de Ramos 21 de marzo, Pascua 28 de marzo. El **Lunes de Aguas**
es el lunes siguiente al Lunes de Pascua: 5 de abril de 2027.

## Resultado oficial contra resultado en vivo

**El oficial siempre gana.** En cuanto `gl_oficial` no es nulo, el vivo deja de mostrarse,
aunque el vivo tuviera confianza 100 y el oficial parezca raro (una incomparecencia se ve
rarísima y es correcta).

Fórmula de confianza, 0–100:

```
confianza = min(100,
    35 * personas_distintas_que_coinciden
  +  1 * suma_de_reputaciones   (tope 30)
  + 15 si hay un delegado de alguno de los dos clubes entre ellas
  - 25 si hay un reporte contradictorio reciente sin resolver)
```

Etiquetas en pantalla, y son importantes: la gente tiene que saber de qué se fía.

| Confianza | Texto |
|---|---|
| < 35 | Sin confirmar — lo ha puesto una persona |
| 35–69 | Coincide entre varias personas |
| ≥ 70 | Confirmado por la grada |
| oficial | Resultado oficial |

Nunca muestres un resultado en vivo sin etiqueta. Un 3-1 sin contexto que luego resulta
falso es peor que no dar nada, porque la gente deja de creerse la aplicación entera.

## Casos que romperán el cálculo

Ténlos en cuenta desde el principio, no cuando aparezcan:

- **Partido aplazado**: sin fecha o con fecha futura, jornada pasada. No cuenta para PJ.
- **Equipo retirado a mitad de liga**: la federación anula todos sus partidos, incluidos
  los ya jugados. Hace falta un flag `anulado` en `partidos`.
- **Grupo con número impar de equipos**: hay jornada de descanso rotatoria.
- **Fase de ascenso** tras la liga regular: es otra competición, no jornadas 27+.
