# Arregla el origen de las fechas ISO: `aplazaClave` escribe `siguiente_intento` en el formato de la base
# (con espacio, sin T ni Z) en vez de ISO. Así la consulta de selección las compara bien y el verificador no
# tiene que normalizar 4.000 fechas cada 15 minutos (26/11/2026).
import sys

ruta = "/srv/data/facylf/scripts/recolector-local.mjs"
s = open(ruta, encoding="utf-8").read()

viejo = """  db.prepare(`update trabajos set estado='pendiente',siguiente_intento=?,ultimo_error=null,
    actualizado_en=? where clave=? and estado!='cancelado'`)
    .run(siguiente, new Date().toISOString(), clave);"""
nuevo = """  // El formato de la base es 'AAAA-MM-DD HH:MM:SS', sin T ni Z. Con ISO, la comparación de la consulta de
  // selección no cuadra y el trabajo parece siempre aplazado (medido el 26/11/2026: 4.049 por pasada).
  const enFormatoDeBase = String(siguiente).replace('T', ' ').replace('Z', '');
  db.prepare(`update trabajos set estado='pendiente',siguiente_intento=?,ultimo_error=null,
    actualizado_en=? where clave=? and estado!='cancelado'`)
    .run(enFormatoDeBase, new Date().toISOString(), clave);"""

if viejo not in s:
    print("NO ENCONTRADO")
    sys.exit(1)
if "enFormatoDeBase" in s:
    print("YA ESTABA")
    sys.exit(0)

s = s.replace(viejo, nuevo, 1)
open(ruta, "w", encoding="utf-8", newline="\n").write(s)
print("ARREGLADO")
