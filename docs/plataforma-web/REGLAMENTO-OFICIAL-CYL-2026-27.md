# Reglamento oficial de competiciones · Castilla y León 2026/27

Fuente: **RFCYLF, Circular nº 1, temporada 2026/27**, «Normas reguladoras de las competiciones oficiales de fútbol», aprobada por la Asamblea General el 23/07/2026.

- Documento: <https://www.rfcylf.es/pnfg/NBdd_DesDocumento?cod_primaria=142&cod_documento=1060497&descargar=0>
- Consulta: 18/11/2026.

## Reglas confirmadas

| Competición | Descensos directos |
|---|---|
| Tercera Federación · Grupo VIII | **3** (16º, 17º, 18º) + arrastre desde Segunda Federación |
| 1ª Regional Aficionados A / B | **4 / 3** + arrastre desde Tercera |
| Liga Nacional Juvenil · Grupo III | **2** (15º, 16º) + arrastre desde División de Honor |
| 1ª Regional Juvenil A / B | **4 / 3** + diferencia de Liga Nacional |
| 1ª/2ª Regional Cadetes | **3** (14º-16º en 1ª) |
| 1ª/2ª Regional Infantiles | **3** (14º-16º en 1ª) |
| Provinciales | **3 / 2 / 1** según 16+, 12-15 o 6-11 equipos |

- El grupo del ganador del play-off a Tercera/Liga Nacional pierde un descenso.
- El número final puede incluir **arrastre**; la web muestra el mínimo directo y avisa de que el arrastre se confirma al cerrar la temporada.
- La circular de 2025/26 sigue disponible para consultar temporadas anteriores.

## Aplicación

`apps/web/src/lib/reglamento.ts` acepta **2025-26** y **2026-27** con estas reglas. La base tiene una fila específica para LNJ 2026/27 (2 directos) y conserva la general histórica.
