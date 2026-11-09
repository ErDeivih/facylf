# Cierre de CyL · tabla por temporada y qué se queda fuera

Foto del **09/11/2026, 18:50**, sobre el canónico del PC (el que sirve la web pública). Una edición está completa
cuando todos sus grupos tienen `ops.coverage_checkpoint.visibility_state='completa'`. La cifra de «ediciones» es la
unión de los dos canónicos (auditoría de las 17:30): el servidor no tiene ninguna edición que no esté en el PC.

| Temporada | Ediciones | Completas | Incompletas | Qué le falta y por qué |
|---|---:|---:|---:|---|
| 2012-13 | 2 | 2 | 0 | **cerrada** |
| 2013-14 | 46 | 5 | 41 | 36 ediciones a importar de la cola del PC (3.687 actas), 5 sin origen conocido |
| 2014-15 | 3 | 3 | 0 | cerradas las 3 de La Preferente; **la 2014-15 de la federación (58 competiciones, 358 grupos, 26.013 actas) solo existe en la cola del servidor y está en la lista de consolidación** |
| 2015-16 | 65 | 9 | 56 | **tanda de importación en curso** (157 grupos con hueco, 7.430 actas) |
| 2016-17 | 58 | 6 | 52 | 142 grupos con hueco en la cola del servidor (13.067 actas): pendientes de paquete |
| 2017-18 | 60 | 10 | 50 | tanda cerrada: el hueco de grupos bajó de 102 a 2 (293.910 filas); 1 grupo falla por acta que no cuadra con el calendario |
| 2018-19 | 61 | 8 | 53 | 124 grupos con hueco en el servidor (12.767 actas) |
| 2019-20 | 56 | 1 | 55 | **tanda de importación pendiente** (la tanda 1 la cubrió en parte) |
| 2020-21 | 31 | 9 | 22 | 154 grupos con hueco en el servidor (3.610 actas); 13 sin origen |
| 2021-22 | 66 | 12 | 54 | hueco de recolección: 31 ediciones necesitan más jornadas/actas de la cola del PC |
| 2022-23 | 70 | 12 | 44 | 129 grupos con hueco en el servidor (12.362 actas); paquete fresco en extracción |
| 2023-24 | 83 | 24 | 45 | el servidor tiene 14 ediciones más completas que el PC, pero su cola ya no las ofrece: queda recolección |
| 2024-25 | 79 | 41 | 23 | **la consolidación desde el servidor la subió de 20 a 41**; quedan 23 con huecos de recolección |
| 2025-26 | 71 | 20 | 43 | 43 ediciones con huecos; la cola del servidor tiene 8 más completas que el PC |
| 2026-27 | 56 | 1 | 55 | **temporada en curso**: no se puede cerrar hasta que termine; el PC ya la recolecta |
| **Total** | **807** | **163** | **644** | |

## Lo que se queda fuera y por qué (auditoría de las 17:30, actualizable)

De las 586 ediciones incompletas que había entonces (hoy el total ha bajado a 644 con 163 completas):

- **300 solo necesitan importación** (151 ya recogidas en la cola del PC y 149 en la del servidor): es trabajo en
  marcha, no un límite. Aquí están casi todas las subidas de hoy.
- **108 necesitan recolección**: jornadas o actas que el portal aún no ha publicado o no se han pedido; el PC las
  recogerá con las 15 temporadas asignadas.
- **22 son de identidad o calendario**: el acta no se corresponde con la fila del calendario (p. ej. el grupo `17134`:
  «Sporting Carbarizos vs Cabrerizos B» frente a «Cabrerizos vs Sporting Garrido de Salamanca»). No se arreglan
  importando; necesitan resolución de identidad. Están listadas con su motivo en la bitácora de operación.
- **156 no tienen origen conocido**: 141 de la federación (grupos de relleno, copas sin actas, fases que el portal no
  carga) y 15 de La Preferente (su origen es otro proyecto de importación). **Estas son irreducibles con las colas
  actuales.**
- **2026-27 (55 incompletas)** es el estado normal de una temporada en curso.

**Techo teórico si todo lo recuperable entra: 521 de 807 (64,6 %).** Es una cota, no una promesa: depende de que el
portal publique lo que falta y de que los 22 casos de identidad se resuelvan uno a uno.

## Cómo reproducir la tabla

```powershell
$sql = Get-Content tmp\medir-canonico-cyl.sql -Raw
$sql | docker exec -i facylf-postgres psql -U facylf_publicador -d facylf -f -
```

El detalle por edición y por grupo (con causa) está en `tmp/auditoria-cierre-cyl/`:
`analisis.json`, `ediciones-incompletas.csv` y `grupos-a-traer.csv`.
