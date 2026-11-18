# Reglamento oficial de competiciones · Castilla y León 2025/26

Fuente: **RFCYLF, Circular nº 1, temporada 2025/26**, «Normas reguladoras de las competiciones oficiales de fútbol», aprobada por la Asamblea General el 24/07/2025.

- Documento: <https://www.rfcylf.es/pnfg/NBdd_DesDocumento?cod_primaria=142&cod_documento=1059968&descargar=0>
- Consulta: 18/11/2026.
- Se guarda como fuente primaria; no se sustituye por inferencias si contradice el texto.

## Tercera Federación · Grupo VIII

- 18 equipos.
- Descienden a 1ª División Regional de Aficionados los puestos **16º, 17º y 18º**.
- Además, descienden tantos puestos inmediatamente anteriores como sea:
  `descendidos de Segunda Federación al Grupo VIII − ascendidos del Grupo VIII a Segunda Federación`.
- Es un **arrastre**: el número final no es fijo.

## 1ª División Regional de Aficionados

Dos grupos de 16: A (Ávila, Burgos, Palencia, Segovia, Soria) y B (León, Salamanca, Valladolid, Zamora).

- Descienden a 1ª Provincial:
  - Grupo A: **13º, 14º, 15º y 16º** (4).
  - Grupo B: **14º, 15º y 16º** (3).
- Además, tantos puestos inmediatamente anteriores como descendidos haya del Grupo VIII de Tercera; se colocan en el grupo geográfico que corresponda.
- El grupo del equipo que gana el play-off de ascenso a Tercera tiene **un descenso menos**.
- Ascienden: campeón A, campeón B y ganador del play-off (2º/3º de cada grupo).

## Liga Nacional Juvenil · Grupo III

- 16 equipos.
- Descienden a 1ª Regional Juvenil los puestos **15º y 16º**.
- Además, tantos puestos inmediatamente anteriores como equipos desciendan de División de Honor Juvenil al Grupo III.

## 1ª División Regional de Juveniles

Dos grupos de 16: A y B, misma distribución provincial.

- Descienden:
  - Grupo A: **13º, 14º, 15º y 16º**.
  - Grupo B: **14º, 15º y 16º**.
- Además, tantos puestos anteriores como sea:
  `descendidos de Liga Nacional Juvenil − ascendidos a Liga Nacional Juvenil`.
- El grupo del ganador del play-off a Liga Nacional tiene **un descenso menos**.

## Cadetes e infantiles

- 1ª Regional Cadetes (16): descienden **14º, 15º y 16º**.
- 2ª Regional Cadetes (16): descienden **14º, 15º y 16º**.
- 1ª Regional Infantiles (16): descienden **14º, 15º y 16º**.
- 2ª Regional Infantiles (16): descienden **14º, 15º y 16º**.

## Provinciales

Baremo de la circular:

| Equipos | Descensos |
|---|---|
| 16 a 20 | 3 |
| 12 a 15 | 2 |
| 6 a 11 | 1 |

Las provinciales pueden tener descensos «en cascada» y vacantes cubiertas por los mejores clasificados no ascendidos.

## Arrastres: cómo se calculan

Un arrastre no es un puesto fijo: depende de los movimientos entre divisiones. Para cada categoría:

1. Contar los que bajan de la división superior a la categoría.
2. Contar los que suben de la categoría a la superior.
3. La diferencia se suma a los descensos directos de la categoría inferior.
4. Si el equipo que asciende por play-off pertenece a un grupo, ese grupo pierde un descenso.

Sin los movimientos oficiales de la temporada, el sistema debe mostrar **«pendiente de arrastre»**, no un número inventado.

## Aplicación en la web

- `apps/web/src/lib/reglamento.ts` centraliza los descensos directos.
- Los arrastres se muestran como pendientes cuando no hay datos oficiales de la temporada.
- La regla de 3 descensos en Tercera queda confirmada por la fuente; no es una suposición.
