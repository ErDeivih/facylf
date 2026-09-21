---
name: diseno-web-futbol
description: Diseña e implementa la interfaz de la plataforma de fútbol de este repositorio — pantallas, componentes, tablas, tablas en móvil, tokens de color, tipografía, densidad, tema oscuro, accesibilidad, gráficos y los textos que ve el usuario. Úsala siempre que escribas o revises algo dentro de apps/web/src/componentes o apps/web/src/app, o cuando decidas cómo se muestra un dato, cómo se nombra o qué pasa cuando falta. No la uses para el modelo de datos, las consultas SQL ni los recolectores.
---

# Interfaz de la plataforma de fútbol

Esta plataforma no enseña datos: responde preguntas de fútbol sobre datos que casi nunca están
completos. La mitad del trabajo de interfaz consiste en decir con precisión qué falta y por qué.

## Antes de escribir una vista

1. [PRODUCTO-UX.md](../../../docs/plataforma-web/PRODUCTO-UX.md) — qué pregunta responde esta
   pantalla, qué filtros lleva y cuál es su criterio de aceptación.
2. [SISTEMA-DISENO.md](../../../docs/plataforma-web/SISTEMA-DISENO.md) — tokens, densidades,
   inventario de componentes y criterio de aceptación visual.
3. [CONTENIDO-MICROCOPIA.md](../../../docs/plataforma-web/CONTENIDO-MICROCOPIA.md) — los textos
   canónicos de ausencia, cobertura, calidad y abreviaturas. **No inventes redacciones nuevas para
   casos que ya tienen una.**
4. [FRONTEND.md](../../../docs/plataforma-web/FRONTEND.md) — dónde va el fichero, si es servidor o
   cliente, cómo se valida `searchParams` y cómo se etiqueta la caché.
5. Si la instalación actual dispone de una skill de visualización de datos, úsala como apoyo. No es
   una dependencia del repositorio: si no existe, aplica directamente `SISTEMA-DISENO.md`. En ambos
   casos los colores salen de los tokens y todo gráfico tiene versión en tabla y etiqueta de
   cobertura.

## Las siete reglas que no se negocian

1. **Ausencia de dato no es cero.** Distingue siempre *no publicado por la fuente* (mira
   `source_capability`), *pendiente de recoger* y *sin datos en este caso*. Los tres tienen texto
   propio. Un marcador desconocido es "sin resultado", nunca `0-0`.
2. **Toda cifra derivada muestra su denominador o no se muestra.** `G/90` sólo con minutos fiables;
   si son estimados, `G/PJ` y la marca `~`.
3. **El estado principal vive en la URL.** Federación, temporada, facetas, orden, cursor y pestaña.
   Un enlace compartido reproduce la pantalla exacta. Valida con zod en el límite.
4. **Server Component por defecto.** Cliente sólo para entrada del usuario, estado efímero que no
   debe ir a la URL, API del navegador o gráficos, y siempre lo más abajo posible del árbol.
   Ordenar o filtrar una tabla se hace en SQL, no en el navegador.
5. **Empieza por el estado vacío.** El orden de implementación es vacío → parcial → completo. Una
   pantalla que sólo se ha visto con Salamanca completa no está terminada: durante los próximos
   meses el estado normal es un grupo con 14 de 30 jornadas.
6. **Nunca sólo color.** Victoria, derrota, tarjeta y cobertura llevan letra o texto además de
   color. Contraste 4.5:1 en texto y 3:1 en bordes y elementos gráficos informativos, en los dos
   temas.
7. **Equipo, club y categoría son cosas distintas.** "C.D. Ribert" es un club; "C.D. Ribert Juvenil
   A · 2025-26" es un equipo. Nunca se suman dos equipos del mismo club en una cifra, nunca existe
   una "plantilla de club".

## Tablas

Son el componente central del producto, así que tienen reglas propias:

- Texto a la izquierda, números a la derecha, **siempre** `tabular-nums` si la columna se compara.
- Cabecera con `scope`, `caption` presente aunque esté visualmente oculta, y encabezados abreviados
  dentro de `<abbr title="...">` según el glosario.
- En móvil **no colapses a tarjetas**: fija la primera columna y desplaza el resto en horizontal
  dentro del contenedor de la tabla. Colapsar destruye la comparación entre filas, que es para lo
  que existe la tabla. El documento nunca se desplaza en horizontal; el contenedor sí.
- La fila entera es enlazable, no sólo el nombre.
- Orden y página vienen de `searchParams`; el orden es un enum traducido a columnas permitidas,
  jamás un nombre de columna que venga del usuario.

## Al terminar

Comprueba la lista de [SISTEMA-DISENO.md](../../../docs/plataforma-web/SISTEMA-DISENO.md) §10:
360 px sin desplazamiento horizontal, tema claro y oscuro, densidad cómoda y compacta, `axe` sin
incidencias serias, recorrible con teclado con foco visible, estados vacío/parcial/error/carga
vistos, `tabular-nums` en columnas comparables, ningún dato ausente como cero, y un nombre de 45
caracteres que no rompa nada.
