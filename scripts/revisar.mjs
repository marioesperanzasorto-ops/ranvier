/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Una revisión rápida, antes de las pruebas: la sintaxis de cada archivo de JavaScript (`node --check`), que los
 * JSON se lean, y que los archivos de texto estén en UTF-8 sin BOM, con saltos de línea LF y un salto al final.
 *
 *   npm run revisar
 */

import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { RAIZ } from './compilar.mjs';

const CARPETAS = ['src', 'scripts', 'pruebas', 'docs'];
const SUELTOS = ['package.json', 'README.md', 'NOTICE', '.gitattributes', '.gitignore'];
const DE_TEXTO = /\.(m?js|json|html|css|svg|md)$/;

const problemas = [];
const archivos = [...SUELTOS];
for (const carpeta of CARPETAS) {
  for (const entrada of await readdir(path.join(RAIZ, carpeta), { withFileTypes: true, recursive: true })) {
    if (entrada.isFile()) archivos.push(path.relative(RAIZ, path.join(entrada.parentPath, entrada.name)).replaceAll('\\', '/'));
  }
}

for (const archivo of archivos.sort()) {
  const ruta = path.join(RAIZ, archivo);
  if (DE_TEXTO.test(archivo) || SUELTOS.includes(archivo)) {
    const bytes = await readFile(ruta);
    const texto = bytes.toString('utf8');
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) problemas.push(`${archivo}: tiene BOM`);
    if (texto.includes('\r')) problemas.push(`${archivo}: tiene saltos de línea CRLF`);
    if (texto.length && !texto.endsWith('\n')) problemas.push(`${archivo}: no termina con un salto de línea`);
    if (Buffer.from(texto, 'utf8').compare(bytes) !== 0) problemas.push(`${archivo}: no es UTF-8`);
  }
  if (/\.json$/.test(archivo)) {
    try {
      JSON.parse(await readFile(ruta, 'utf8'));
    } catch (e) {
      problemas.push(`${archivo}: JSON roto (${e.message})`);
    }
  }
  if (/\.m?js$/.test(archivo)) {
    try {
      execFileSync(process.execPath, ['--check', ruta], { stdio: 'pipe' });
    } catch (e) {
      problemas.push(`${archivo}: ${String(e.stderr || e.message).trim().split('\n').slice(0, 5).join(' ')}`);
    }
  }
}

if (problemas.length) {
  console.error(`La revisión encontró ${problemas.length} problema(s):\n- ${problemas.join('\n- ')}`);
  process.exit(1);
}
console.log(`Revisión: ${archivos.length} archivos en orden.`);
