/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Empaqueta `dist/` (la compilación de las tiendas) en `paquete/ranvier-<versión>.zip`, el archivo que se sube a la
 * tienda de Chrome y a la de Edge. El manifiesto queda en la raíz del .zip. El .zip sale siempre igual para el mismo
 * código (sin fechas de los archivos), y antes de escribirlo se revisa que sea la compilación de las tiendas.
 *
 *   npm run paquete      (compila y empaqueta)
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { RAIZ } from './compilar.mjs';

const CARPETA = path.join(RAIZ, 'dist');
// 1 de enero de 2026, 00:00, en el formato de fecha de MS-DOS que usan los .zip
const HORA_DOS = 0;
const FECHA_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;

async function archivos(carpeta, base = carpeta) {
  const lista = [];
  for (const entrada of await readdir(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) lista.push(...await archivos(ruta, base));
    else if (entrada.isFile()) lista.push(path.relative(base, ruta).replaceAll('\\', '/'));
  }
  return lista;
}

/** Un .zip con «deflate», como lo piden las tiendas. */
export function crearZip(entradas) {
  const partes = [];
  const central = [];
  let desplazamiento = 0;
  for (const { nombre, datos } of entradas) {
    const nombreEnBytes = Buffer.from(nombre, 'utf8');
    const comprimidos = zlib.deflateRawSync(datos, { level: 9 });
    const crc = zlib.crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(HORA_DOS, 10);
    local.writeUInt16LE(FECHA_DOS, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimidos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreEnBytes.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nombreEnBytes, comprimidos);

    const cabecera = Buffer.alloc(46);
    cabecera.writeUInt32LE(0x02014b50, 0);
    cabecera.writeUInt16LE(20, 4);
    cabecera.writeUInt16LE(20, 6);
    cabecera.writeUInt16LE(0x0800, 8);
    cabecera.writeUInt16LE(8, 10);
    cabecera.writeUInt16LE(HORA_DOS, 12);
    cabecera.writeUInt16LE(FECHA_DOS, 14);
    cabecera.writeUInt32LE(crc, 16);
    cabecera.writeUInt32LE(comprimidos.length, 20);
    cabecera.writeUInt32LE(datos.length, 24);
    cabecera.writeUInt16LE(nombreEnBytes.length, 28);
    cabecera.writeUInt32LE(desplazamiento, 42);
    central.push(cabecera, nombreEnBytes);
    desplazamiento += local.length + nombreEnBytes.length + comprimidos.length;
  }
  const directorio = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...partes, directorio, fin]);
}

export async function empaquetar(carpeta = CARPETA, salida = path.join(RAIZ, 'paquete')) {
  const manifiesto = JSON.parse(await readFile(path.join(carpeta, 'manifest.json'), 'utf8'));
  if (/desarrollo/.test(manifiesto.name) || JSON.stringify(manifiesto).includes('localhost')) {
    throw new Error('dist/ es la compilación de desarrollo: corre «npm run paquete», que compila la de las tiendas');
  }
  const nombres = (await archivos(carpeta)).sort();
  const entradas = [];
  for (const nombre of nombres) entradas.push({ nombre, datos: await readFile(path.join(carpeta, nombre)) });
  await mkdir(salida, { recursive: true });
  const destino = path.join(salida, `ranvier-${manifiesto.version}.zip`);
  const zip = crearZip(entradas);
  await writeFile(destino, zip);
  return { destino, archivos: nombres.length, bytes: zip.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { destino, archivos: cuantos, bytes } = await empaquetar();
  console.log(`Paquete listo: ${path.relative(RAIZ, destino)} (${cuantos} archivos, ${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}
