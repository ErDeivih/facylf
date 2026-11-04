# Ficha del agente — FACYLF — plataforma de futbol federado de Castilla y Leon

**Id en el panel**: `facylf`
**Ruta**: `F:\EspacioCodigo\facylf`
**Rama de trabajo**: `fase-c`
**Familia de interfaz**: A (panel de datos) + D (catalogo) — ver `F:\Inforepositorios\indice\RECETAS-UI.md`

## Mision

Implementar la plataforma contra el prototipo de 22 pantallas que esta en diseno/prototipo, y dejar la ingesta repartida por temporadas entre PC y servidor sin duplicar trabajo.

## Como trabajas

Lee y sigue `F:\EspacioCodigo\_flujo-dsh\PROTOCOLO-AUTONOMIA.md`. En resumen:

- **Nivel 1**: decide solo y ejecuta (refactor, pruebas, docs, rendimiento, accesibilidad).
- **Nivel 2**: decide solo pero lo anotas en `DECISIONES.md` (pantallas ya especificadas, dependencias pequenas, esquema reversible).
- **Nivel 3**: paras y preguntas (alcance, datos, credenciales, dinero, otro proyecto, ramas).
- **Una tarea bloqueada no para la sesion**: la marcas y sigues con la siguiente.

Antes de escribir codigo, lee `ESPECIFICACION.md`. Si no existe o esta vacia, **eso** es la tarea.

## Tu backlog

Vive en `BACKLOG.md`. Nunca puede tener menos de 5 tareas listas. Si baja, generas mas de estas tres fuentes:

1. **Competencia**: que hacen las apps del sector y que nos falta.
2. **Huecos de la especificacion**: pantallas prometidas sin hacer, estados sin cubrir.
3. **Deuda tecnica**: pruebas, duplicacion, dependencias.

## Investigacion inicial encomendada

Otras plataformas de resultados federativos (ResultadosFutbol, Futbolme, La Preferente, BeSoccer, SofaScore). Como presentan clasificacion, jornada y acta.

Se deja en `INVESTIGACION.md`: que se ha mirado, que hace la competencia, que nos falta y **una propuesta concreta de tarea**.

## Primera tarea

Poner las pruebas en verde: identificar que prueba falla y por que, una por una.

## Al terminar cada sesion

Deja `ESTADO-AGENTE.md` actualizado con este formato exacto. De ahi lo lee el panel:

```
titulo: FACYLF — plataforma de futbol federado de Castilla y Leon
estado: en-curso
tarea: lo que estabas haciendo
nivel: 1 | 2 | 3
siguiente: lo proximo que haras
bloqueado: la pregunta de nivel 3, si la hay
fecha: AAAA-MM-DD
```

Y recuerda: **sin commit y sin push, no esta terminado.**