/*
 * AUDITORÍA DE CAPACIDAD: junta en un solo documento lo que hoy se mira en tres sitios.
 *
 * Responde a las preguntas del encargo con números, y las deja escritas para poder compararlas mañana:
 *   · ¿qué ritmo lleva cada federación, y cuánto le queda por delante?
 *   · ¿cuántas plazas hay, cuántas se usan, quién las tiene y cuánto le queda de turno?
 *   · ¿quién está esperando y por qué (memoria o plaza)?
 *   · ¿qué se ha trabajado en los últimos minutos?
 *
 * No mide nada por su cuenta: llama a los diagnósticos que ya existen y pega su salida, para que no haya dos
 * verdades distintas sobre lo mismo.
 *
 * Uso: node scripts/auditar-capacidad.mjs [--minutos 30]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const i = argumentos.indexOf('--minutos');
const minutos = i >= 0 ? argumentos[i + 1] : '30';

const corre = (guion, args = []) => {
  try {
    return execFileSync(process.execPath, [join(raiz, 'scripts', guion), ...args], { encoding: 'utf8', timeout: 300000 });
  } catch (error) {
    return `(el diagnóstico ${guion} falló: ${error.message})\n${error.stdout ?? ''}`;
  }
};

const cuando = new Date().toISOString();
const documento = `# Auditoría de capacidad de la ingesta

Medido: **${cuando}** · ventana de ${minutos} min · máquina: ${
  process.platform === 'win32' ? 'PC de trabajo (Windows)' : 'servidor (Linux)'} ·
presupuesto declarado: ${process.env.FACYLF_MEMORIA_GB ? `${process.env.FACYLF_MEMORIA_GB} GB` : 'no declarado'}.

Generado por \`scripts/auditar-capacidad.mjs\`, que pega la salida de los diagnósticos existentes
(\`_diag-plazas.mjs\`, \`_diag-ultimos-minutos.mjs\`, \`_diag-ritmo-real.mjs\`) para no tener dos verdades
distintas sobre lo mismo.

## 1 · Plazas, turnos y quién espera

\`\`\`
${corre('_diag-plazas.mjs', [minutos]).trim()}
\`\`\`

## 2 · Qué se ha trabajado en la ventana

\`\`\`
${corre('_diag-ultimos-minutos.mjs', [minutos]).trim()}
\`\`\`

## 3 · Ritmo real frente al ritmo configurado

\`\`\`
${corre('_diag-ritmo-real.mjs', [minutos]).trim()}
\`\`\`

## Cómo se lee esto

* **plazas**: el gobernador reparte el presupuesto en plazas de 0,75 GB (medido). Con 10 GB declarados salen
  **11**; sin declarar, la mitad de la memoria del equipo. Las fichas viven en \`.estado-workers/slots-chrome\`.
* **turno**: una federación conserva su plaza hasta 150 min, y **sólo la suelta si hay otras esperando**. Al
  ceder, su supervisor la relanza y entra por el final de la cola.
* **esperando**: las fichas \`espera-*.ficha\` son la cola. Si alguien espera y hay plazas libres, el motivo es
  la memoria (el suelo de emergencia), no el reparto.
* **ritmo real**: el hueco mediano entre peticiones debería estar en la pausa configurada (6-8 s en las PNFG,
  4-6 s en iSquad). Si está muy por encima, hay algo comiéndose el tiempo: reciclados, mantenimiento local o
  esperas.
`;

const carpeta = join(raiz, 'pruebas', 'reconstruccion');
mkdirSync(carpeta, { recursive: true });
const ruta = join(carpeta, 'auditoria-capacidad.md');
writeFileSync(ruta, documento);
console.log(`auditoría escrita en ${ruta}`);
console.log(documento.split('\n').slice(0, 12).join('\n'));
