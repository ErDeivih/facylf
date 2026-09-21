# ADR-0009 — Paleta de producto neutra y dos densidades

- Estado: aceptada
- Fecha: 2026-09-14

## Contexto

La web actual usa el rojiblanco del C.D. Munibar Pizarrales. El producto cubre diecinueve
federaciones territoriales y sus miles de clubes. Además convive un uso de orientación (buscar,
navegar) con otro de análisis (comparar filas), que piden aire y densidad respectivamente.

## Decisión

Paleta de producto neutra en grises fríos con un acento azul-verde, definida como tokens en
`tokens.css`. Los colores de club se usan sólo en el contexto de ese club o equipo. La interfaz
ofrece dos densidades, cómoda y compacta, conmutables por el usuario y persistidas en cookie.

## Alternativas consideradas

- **Mantener el rojiblanco**: teñir de rojo la clasificación de un grupo catalán sugiere una
  pertenencia inexistente, y el rojo saturado compite con los colores semánticos de derrota,
  tarjeta roja y aviso.
- **Una sola densidad**: la cómoda hace ilegible una clasificación de 20 equipos con 10 columnas en
  portátil; la compacta hace hostil la portada y el móvil.

## Consecuencias

- Ningún componente contiene un color literal; si un valor no tiene token, primero se crea el token.
- La densidad se resuelve en el servidor desde la cookie, para que el primer HTML ya sea correcto.
- Los colores semánticos (victoria, derrota, tarjeta, cobertura) quedan libres y con contraste
  suficiente en tema claro y oscuro.

## Cómo revertirla

Cambiar los valores de los tokens en un único fichero. Ningún componente hay que tocar.
