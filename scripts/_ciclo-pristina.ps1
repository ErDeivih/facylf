# Ciclo integral en la copia «pristina» de Euskadi (contrato 4 · esquema 5), sin tocar la cola real.
#
# Secuencia: simular → aplicar (correcciones + retirada, en UNA invocación) → verificar → volver a aplicar
#            (idempotencia) → revertir → comprobar que la huella lógica vuelve a la de partida → simular otra vez.
#
# Dos cosas aprendidas al escribir esto, y las dos importan:
#
# 1. `$Args` es una variable automática de PowerShell: usarla de parámetro deja el splatting vacío, así que
#    el script llamaba a la herramienta SIN `--aplicar` y la herramienta hacía lo correcto en ese caso
#    —simular y no escribir nada—. Por eso el parámetro se llama `$Opciones` y por eso cada paso comprueba
#    que ha pasado lo que tenía que pasar, en vez de dar por hecho que sí.
# 2. Un lote se aplica UNA vez: `--aplicar <id>` y luego `--aplicar <id> --retirar-fantasma` sobre el mismo
#    manifiesto no completa la retirada, porque las jornadas ya están marcadas como hechas. La retirada va
#    en la misma invocación, o en un manifiesto nuevo simulado después del lote ya aplicado.
$ErrorActionPreference = 'Continue'
$raiz = 'pruebas\reconstruccion\pristina'
$cola = "$raiz\descargas-euskadi\recolector-local\cola-v2.sqlite"
$ref  = "$raiz\pruebas\reconstruccion\_original.sqlite"
$salida = "$raiz\pruebas\reconstruccion\ciclo.log"

if (-not (Test-Path $ref)) { Copy-Item $cola $ref -Force }

function Herramienta { param([string[]]$Opciones) & npx tsx scripts/reconstruir-cola.mjs --federacion euskadi --raiz $raiz @Opciones 2>&1 }

function CuentaFilas {
  $n = & node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(db.prepare('select count(*) n from partidos').get().n);db.close()" $cola
  return "$n".Trim()
}

function Anota { param([string]$texto) $texto | Out-File $salida -Append -Encoding utf8 }

"### 1. SIMULAR" | Out-File $salida -Encoding utf8
Anota "filas antes de nada: $(CuentaFilas)"
$sim = Herramienta @('--simular')
$sim | Out-File $salida -Append -Encoding utf8
$id = ([regex]::Match(($sim -join "`n"), 'id del lote: ([0-9a-f]+)')).Groups[1].Value
Anota "### id del lote: $id"
if (-not $id) { Anota 'SIN ID: se detiene'; exit 1 }

"`n### 2. APLICAR (correcciones + retirada, una invocación)" | Out-File $salida -Append -Encoding utf8
$paso = Herramienta @('--aplicar', $id, '--retirar-fantasma')
$paso | Out-File $salida -Append -Encoding utf8
if (($paso -join "`n") -match 'nada se ha escrito') { Anota 'FALLO: el paso 2 no aplicó nada' }
Anota "filas tras aplicar (esperado 33.819): $(CuentaFilas)"

"`n### 3. VERIFICAR" | Out-File $salida -Append -Encoding utf8
(Herramienta @('--verificar', $id)) | Out-File $salida -Append -Encoding utf8

"`n### 4. VOLVER A APLICAR (idempotencia: 0 filas nuevas)" | Out-File $salida -Append -Encoding utf8
(Herramienta @('--aplicar', $id, '--retirar-fantasma')) | Out-File $salida -Append -Encoding utf8
Anota "filas tras reaplicar (esperado 33.819): $(CuentaFilas)"

"`n### 5. HUELLA LÓGICA CON EL LOTE APLICADO (debe DIFERIR de la de partida)" | Out-File $salida -Append -Encoding utf8
(& node scripts/comparar-cola.mjs $ref $cola 2>&1) | Out-File $salida -Append -Encoding utf8

"`n### 6. REVERTIR" | Out-File $salida -Append -Encoding utf8
(Herramienta @('--revertir', $id)) | Out-File $salida -Append -Encoding utf8
Anota "filas tras revertir (esperado 34.358): $(CuentaFilas)"

"`n### 7. HUELLA LÓGICA TRAS REVERTIR (debe ser IGUAL a la de partida)" | Out-File $salida -Append -Encoding utf8
(& node scripts/comparar-cola.mjs $ref $cola 2>&1) | Out-File $salida -Append -Encoding utf8

"`n### 8. SIMULAR OTRA VEZ (debe repetir el mismo id)" | Out-File $salida -Append -Encoding utf8
(Herramienta @('--simular')) | Out-File $salida -Append -Encoding utf8

"`n### FIN" | Out-File $salida -Append -Encoding utf8
