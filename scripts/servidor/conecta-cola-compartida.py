# Conecta el recolector a la cola compartida: antes del bucle de trabajo, rellena la cola local desde
# Postgres. Si Postgres falla, la función devuelve 0 y el recolector sigue con su cola (nunca se queda sin
# trabajar por la base compartida). 26/11/2026.
import sys

ruta = "/srv/data/facylf/scripts/recolector-local.mjs"
s = open(ruta, encoding="utf-8").read()

if "rellenaDesdePostgres" in s:
    print("YA ESTABA")
    sys.exit(0)

# 1. Importar el módulo junto a los demás imports locales.
marca_import = "import {\n  decisionesPendientesPorActa"
if marca_import not in s:
    print("NO ENCONTRADO EL BLOQUE DE IMPORTS")
    sys.exit(1)
s = s.replace(
    marca_import,
    "import { rellenaDesdePostgres } from './lib/cola-postgres.mjs';\n" + marca_import,
    1,
)

# 2. Rellenar antes del bucle que pide trabajo.
marca_bucle = "    driver = await creaDriver();\n    while (hechos < max) {"
if marca_bucle not in s:
    print("NO ENCONTRADO EL BUCLE")
    sys.exit(1)
s = s.replace(
    marca_bucle,
    """    driver = await creaDriver();
    // Si hay cola compartida configurada, el trabajo se reclama de Postgres (así dos navegadores no pueden
    // coger lo mismo). Sin ella, todo sigue como siempre con la cola local.
    const traidos = await rellenaDesdePostgres(db, PERFIL_NOMBRE, 200);
    if (traidos > 0) console.log(`  · ${traidos} trabajos reclamados de la cola compartida.`);
    while (hechos < max) {""",
    1,
)

open(ruta, "w", encoding="utf-8", newline="\n").write(s)
print("CONECTADO")
