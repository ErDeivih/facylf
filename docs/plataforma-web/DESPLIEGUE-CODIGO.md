# Desplegar código de los recolectores en el servidor (07/10/2026)

## El problema

El arreglo del índice de jornadas se desplegó con `docker cp` dentro de los contenedores y **desapareció** al
recrearlos (`docker compose up -d` para bajar el suelo de temporadas): un contenedor recreado vuelve a la imagen.
Lo mismo le habría pasado a cualquier otro arreglo copiado así. Y nada avisaba: el recolector siguió corriendo con
el código viejo.

## La decisión

**El código se monta del repositorio del servidor, de sólo lectura**: `docker/compose.yml` monta
`../scripts:/app/scripts:ro` y `../perfiles:/app/perfiles:ro` en los 26 servicios de recolección (los 16 + las
5 territoriales + Valencia, Madrid, Cataluña, la prueba y la pasada del fin de semana). Se quitaron los cinco
montajes de ficheros sueltos que había (eran el mismo parche, a medias).

Por qué esto y no reconstruir la imagen: la imagen se construye en el servidor, que tiene cuatro núcleos ocupados
por los recolectores (construir la web allí llegó a ir al 0,8 % de un núcleo); y lo que cambia a menudo es
`scripts/`, que no necesita compilar nada. Lo que sí sigue dentro de la imagen y exige reconstruirla: dependencias
(`node_modules`) y el parser compilado `packages/ingesta/dist`.

## Cómo se despliega desde ahora

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1

1. Empaqueta `scripts/` y `perfiles/` del PC, los copia a `/srv/data/facylf` y enseña la huella (SHA-256) de los
   ficheros clave en el PC, en el repositorio del servidor y **dentro** del contenedor `federacion`.
2. **La primera vez** hay que copiar también `docker/compose.yml` y recrear los recolectores
   (`docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml up -d <servicios>`).
   ⚠ Hacerlo **después** del paso 1: si se recrea antes, los contenedores montan el `scripts/` viejo del servidor
   (del 22/09) y se pierde todo lo desplegado desde entonces.
3. Las siguientes veces basta el paso 1 y `docker compose … restart` de los recolectores (un `node` en marcha no
   relee el código).
4. `-SoloComprobar` repite sólo la comparación de huellas: vale para cualquier momento, y sobre todo después de
   recrear contenedores.
