import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import axiosRetry from 'axios-retry';
import iconv from 'iconv-lite';
import fs from 'fs-extra';
import path from 'path';

// ==========================================
// CONFIGURACIÓN
// ==========================================
const OUTPUT_DIR = path.join(process.cwd(), 'descargas-federacion');
const BASE_URL = 'https://www.rfcylf.es';
const COD_PRIMARIA = '1000120';

// Temporadas a descargar (Año de inicio). 
const TEMPORADAS = [2022, 2023, 2024, 2025, 2026]; 

const DELEGACIONES = [
  { id: '1006', nombre: 'Salamanca' },
  // { id: '1009', nombre: 'Valladolid' }, // Descomenta para añadir más
];

// ⚙️ INTERRUPTORES DE DESCARGA
const DOWNLOAD_EXCEL = true;       // Mantiene compatibilidad con el vigilante clásico
const DOWNLOAD_JORNADAS = true;    // NUEVO: Descarga el HTML de todas las jornadas (necesario para parseaJornada)
const DOWNLOAD_ACTAS = false;      // NUEVO: Descarga el HTML de las actas (trazabilidad jugadores). 
                                   // ⚠️ Ponlo en TRUE solo cuando hayas validado que parseaJornada funciona.

const MAX_JORNADAS = 34;           // Límite de seguridad (la mayoría son 26-30)
const delay = () => new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));

// ==========================================
// CLIENTE HTTP ROBUSTO
// ==========================================
const jar = new CookieJar();
const client = wrapper(axios.create({
  jar,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9'
  },
  responseType: 'arraybuffer',
  timeout: 20000
}));

axiosRetry(client, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429
});

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================
async function initSession() {
  console.log('🍪 Iniciando sesión y obteniendo cookies...');
  await client.get(BASE_URL);
  console.log('✅ Sesión iniciada.');
}

async function fetchHTML(url: string): Promise<string> {
  const response = await client.get(url);
  return iconv.decode(response.data, 'latin1');
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await client.get(url);
  return Buffer.from(response.data);
}

function ensureDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function sanitize(str: string) {
  return str.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
}

// ==========================================
// LÓGICA DE DESCARGA POR COMPETICIÓN
// ==========================================
async function descargarCompeticion(
  codTemporada: string,
  codCompeticion: string,
  nombreCompeticion: string,
  codGrupo: string,
  nombreGrupo: string
) {
  const safeComp = sanitize(nombreCompeticion);
  const safeGrupo = sanitize(nombreGrupo);
  const prefix = `comp-${codCompeticion}-gr-${codGrupo}-temp-${codTemporada}`;

  console.log(`   ⬇️  Procesando: ${safeComp} - ${safeGrupo}`);

  // 1. EXCEL (Opcional, por compatibilidad)
  if (DOWNLOAD_EXCEL) {
    const urls = [
      { endpoint: 'NFG_VisCalendario_Vis', suffix: 'calendario.xls' },
      { endpoint: 'NFG_VisClasificacion', suffix: 'clasificacion.xls' }
    ];
    for (const { endpoint, suffix } of urls) {
      const url = `${BASE_URL}/pnfg/NPcd/${endpoint}?cod_primaria=${COD_PRIMARIA}&codtemporada=${codTemporada}&codcompeticion=${codCompeticion}&codgrupo=${codGrupo}&excel=1&NPcd_File=1`;
      const filePath = path.join(OUTPUT_DIR, `${prefix}-${suffix}`);
      if (!fs.existsSync(filePath)) {
        try {
          const buffer = await fetchBuffer(url);
          fs.writeFileSync(filePath, buffer);
        } catch (e) { /* Ignorar si no existe */ }
      }
      await delay();
    }
  }

  // 2. JORNADAS (HTML) - NUEVO REQUISITO DEL AGENTE
  if (DOWNLOAD_JORNADAS) {
    let emptyJornadasCount = 0;

    for (let jornada = 1; jornada <= MAX_JORNADAS; jornada++) {
      const filePath = path.join(OUTPUT_DIR, `${prefix}-jornada-${jornada}.html`);
      
      if (fs.existsSync(filePath)) {
        continue; // Ya descargada
      }

      const url = `${BASE_URL}/pnfg/NPcd/NFG_CmpJornada?cod_primaria=${COD_PRIMARIA}&CodCompeticion=${codCompeticion}&CodGrupo=${codGrupo}&CodTemporada=${codTemporada}&CodJornada=${jornada}`;
      
      try {
        const html = await fetchHTML(url);
        
        // Heurística: Si el HTML no contiene "Partido" o "No se han encontrado", asumimos que está vacía.
        // Pero para ser seguros, guardamos y verificamos tamaño o contenido.
        if (html.includes('No se han encontrado resultados') || html.length < 2000) {
          emptyJornadasCount++;
          if (emptyJornadasCount >= 2) {
            console.log(`      ⏹️  Fin de temporada detectado en Jornada ${jornada}.`);
            break; // Dejamos de buscar más jornadas
          }
        } else {
          emptyJornadasCount = 0; // Resetear si encontramos una válida
          fs.writeFileSync(filePath, html, 'utf8');
          console.log(`      ✅ Jornada ${jornada} guardada.`);

          // 3. ACTAS (HTML) - TRAZABILIDAD DE JUGADORES
          if (DOWNLOAD_ACTAS) {
            // Extraer todos los CodActa de esta jornada
            const actaRegex = /NFG_CmpPartido\?cod_primaria=\d+&CodActa=(\d+)/gi;
            const actasEncontradas = new Set<string>();
            let match;
            while ((match = actaRegex.exec(html)) !== null) {
              actasEncontradas.add(match[1]);
            }

            for (const codActa of actasEncontradas) {
              const actaFilePath = path.join(OUTPUT_DIR, `${prefix}-acta-${codActa}.html`);
              if (!fs.existsSync(actaFilePath)) {
                const urlActa = `${BASE_URL}/pnfg/NPcd/NFG_CmpPartido?cod_primaria=${COD_PRIMARIA}&CodActa=${codActa}`;
                try {
                  const htmlActa = await fetchHTML(urlActa);
                  fs.writeFileSync(actaFilePath, htmlActa, 'utf8');
                  console.log(`         📄 Acta ${codActa} guardada (consentimiento aplicado en parser).`);
                  await delay();
                } catch (e) {
                  console.log(`         ⚠️  Error acta ${codActa}:`, (e as Error).message);
                }
              }
            }
          }
        }
      } catch (e) {
        console.log(`      ⚠️  Error en jornada ${jornada}:`, (e as Error).message);
      }
      
      await delay(); // Rate limit entre cada jornada
    }
  }
}

// ==========================================
// DESCUBRIMIENTO Y BUCLE PRINCIPAL
// ==========================================
async function procesarTemporadaYDelegacion(anioInicio: number, delegacion: any) {
  const codTemporada = String(anioInicio - 2004);
  console.log(`\n📅 Temporada ${anioInicio}/${anioInicio + 1} (cod: ${codTemporada}) | 📍 ${delegacion.nombre}`);

  const urlComp = `${BASE_URL}/pnfg/NPcd/NFG_Mov_LstCompeticiones?cod_primaria=${COD_PRIMARIA}&competicion=1&rt=1&codtemporada=${codTemporada}&coddelegacion=${delegacion.id}`;
  const htmlComp = await fetchHTML(urlComp);
  
  const compRegex = /href="[^"]*codcompeticion=(\d+)[^"]*"[^>]*>(.*?)<\/a>/gi;
  const competiciones = new Map<string, string>();
  let match;
  while ((match = compRegex.exec(htmlComp)) !== null) {
    const cod = match[1];
    const nombre = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    if (nombre.length > 3 && !competiciones.has(cod)) {
      competiciones.set(cod, nombre);
    }
  }

  console.log(`   🔍 Encontradas ${competiciones.size} competiciones.`);
  await delay();

  for (const [codComp, nombreComp] of competiciones.entries()) {
    const urlGrupos = `${BASE_URL}/pnfg/NPcd/NFG_Mov_LstGruposCompeticion?cod_primaria=${COD_PRIMARIA}&buscar=1&codcompeticion=${codComp}&rt=1`;
    const htmlGrupos = await fetchHTML(urlGrupos);
    
    const grupoRegex = /href="[^"]*CodGrupo=(\d+)[^"]*"[^>]*>(.*?)<\/a>/gi;
    const grupos = new Map<string, string>();
    let matchG;
    while ((matchG = grupoRegex.exec(htmlGrupos)) !== null) {
      const codGrupo = matchG[1];
      const nombreGrupo = matchG[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
      if (nombreGrupo.length > 3 && !grupos.has(codGrupo)) {
        grupos.set(codGrupo, nombreGrupo);
      }
    }

    for (const [codGrupo, nombreGrupo] of grupos.entries()) {
      await descargarCompeticion(codTemporada, codComp, nombreComp, codGrupo, nombreGrupo);
    }
  }
}

// ==========================================
// PUNTO DE ENTRADA
// ==========================================
async function main() {
  console.log('🚀 INICIANDO DESCARGA RFCYLF (Alineado con parseaJornada.ts)');
  console.log(`📁 Directorio: ${OUTPUT_DIR}`);
  console.log(`⚙️  Configuración: Jornadas=${DOWNLOAD_JORNADAS}, Actas=${DOWNLOAD_ACTAS}, Excel=${DOWNLOAD_EXCEL}`);
  
  ensureDir();
  await initSession();

  for (const anio of TEMPORADAS) {
    for (const delegacion of DELEGACIONES) {
      try {
        await procesarTemporadaYDelegacion(anio, delegacion);
      } catch (error) {
        console.error(`❌ Error en ${delegacion.nombre} ${anio}:`, error);
      }
    }
  }

  console.log('\n🎉 DESCARGA COMPLETADA. Ejecuta ahora: pnpm ingesta:una --cod ... --jornadas (o pnpm ingesta:vigilar)');
}

main().catch(console.error);