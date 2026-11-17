# Reglas de categorías y zonas · Castilla y León

Decisión funcional aportada por David el 17/11/2026. **Estado: provisional hasta contrastar con los
reglamentos de la Federación.** Lo que no esté confirmado se marca como «por verificar» y no se usa
para inventar plazas.

## 1 · Orden de categorías

### Aficionados (sénior)

1. **Tercera Federación** (grupos; es la categoría sénior más alta que nos incumbe).
2. **Regional de Aficionados** (dos grupos).
3. **Provincial**: Primera Provincial, Segunda Provincial y Tercera Provincial.
   - Puede haber varios grupos en la última categoría; el grupo no cambia la categoría.

No hay categoría sénior de Castilla y León por encima de Tercera Federación en los datos que se
publican. Las categorías nacionales superiores no forman parte de esta web.

### Juvenil

1. **División de Honor**: competición de la RFEF cuyo grupo forman clubes de Castilla y León; no es una liga propia de la federación territorial.
2. **Liga Nacional**: la liga de Castilla y León más alta.
3. **Liga Regional**: dos grupos, A y B.
4. **Provinciales**: Primera, Segunda, Tercera y sus grupos.

Ascenso a Liga Nacional: suben el **campeón de cada grupo** y una plaza más sale de un **play-off entre
segundos y terceros** de los grupos A y B; son **3 plazas**. *Por verificar el formato exacto de los
cruces.*

### Cadete

1. Primera Regional Cadete.
2. Segunda Regional Cadete.
3. Provinciales.

### Infantil

Igual que cadete: Primera Regional, Segunda Regional y provinciales.

### Alevín

No hay jerarquía cerrada confirmada. No se inventa: se usa la categoría y la división que publique la
federación y se marca como «por verificar».

### Otras competiciones

Copas de delegación, copas de federación, fases de ascenso y play-offs son competiciones o fases
aparte. No se mezclan con la liga regular ni se usan para calcular sus puestos.

## 2 · Zonas de ascenso, playoff y descenso

### Tercera Federación → Regional

- **Descienden 3 equipos de base** (dato confirmado por David; corrige el valor aprendido de 2), más
  los posibles arrastres por bajadas de Segunda Federación.
- Las plazas de ascenso directo y de play-off se resolverán con el reglamento de la temporada; no se
  fijan aquí.

### Juvenil Regional

- Descienden **4 últimos de cada grupo** y, además, el peor quinto entre los grupos: **9 descensos en
  total**.
- Asciende el **campeón de cada provincial**.
- Los **arrastres** pueden librar alguna plaza.

### Arrastres

- Si desciende un equipo A y su equipo B está en la categoría inmediatamente inferior, el B también
  puede arrastrarse.
- Si bajan muchos equipos de la misma provincia desde Regional/Nacional, puede haber arrastres
  provinciales.
- Un arrastre **no se deduce del nombre**: hay que verificar la inscripción y la categoría del filial.

### Sin play-out (por verificar)

- En Juvenil Regional, el quinto por la cola de cada grupo **no juega un play-out**; desciende el peor
  quinto por puntos y balance. *Por verificar con el reglamento vigente; el criterio exacto del peor
  quinto no está confirmado.*

## 3 · Regla de implementación

1. `analytics.zonas_de_grupo` ya da prioridad a `core.reglamento_grupo`; no se consultan como pasos
   separados.
2. Si el origen es `aprendida`, se muestra como estimación con su número de temporadas.
3. Si no hay reglamento ni zona aprendida, se puede usar la **regla funcional** de este documento,
   guardada como dato con `estado='provisional'`, y se muestra como provisional; nunca como oficial.
4. Si no hay ninguna, no se rellena: se oculta la columna y se dice «sin zona publicada».

## 4 · Lo que falta por verificar con la federación

- Plazas exactas de ascenso directo y play-off en Tercera Federación.
- Formato del play-off de ascenso a Liga Nacional Juvenil.
- Número de grupos y plazas de las provinciales de cada categoría.
- Arrastres: cuándo se aplican y cuántos.
- Categoría de alevín y categorías inferiores.
- Copa/play-off: qué competiciones cuentan para el registro de ascensos y descensos.
