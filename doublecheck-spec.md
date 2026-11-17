# Doublecheck spec

## Goal
Cerrar las páginas de proyección y previa de Fondo Popular con tabla estimada usable, escudos, zonas históricas, matriz completa de resultados, Elo, layout puzzle, fotos públicas/privadas y verificación 390/1280.

## Scope
UI de /explorar/competicion/[id]/proyeccion y /explorar/previa/[id]; consultas de zonas y simulación; exportación de fotos a la demo; verificación de rutas y responsive. Fuera: cambiar el modelo, la ingesta o los recolectores.

## Acceptance criteria
1) La tabla muestra escudos, puesto, puntos, rango, campeón y zonas cuando hay dato. 2) Zonas sin reglamento usan la moda histórica de grupos comparables y se etiquetan como estimación. 3) La previa incluye matriz 0-4, H2H y gráfica en rejilla puzzle. 4) Fotos visibles en demo pública y en privado, con consentimiento explícito de David. 5) Build, lint y tsc pasan; URLs 200; scrollWidth = viewport a 390 y 1280.

## Failure modes
Sin filas históricas: no inventar, ocultar columna y decirlo. Foto ausente o 404: monograma. Grupo tipo fase: no atribuirle playoff. API estática: exportar imágenes y reescribir URLs; si falla, no romper la página. Base caída: mostrar aviso, no cifras falsas.

## Priorities
Primero corrección y no inventar datos; después claridad de tabla; después fotos; después rendimiento. La suite completa queda documentada con sus dos fallos de base si no se resuelven.

## Non-goals
No tocar el modelo publicado, la ingesta ni el ritmo de los recolectores. No publicar fotos sin la autorización explícita ya dada. No rellenar zonas sin respaldo histórico.
