/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * El paquete para las tiendas (`scripts/paquete.mjs`): un .zip que se lee, con el manifiesto en la raíz y los mismos
 * archivos que la compilación, byte por byte. No empaqueta la compilación de desarrollo.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { compilar } from '../../scripts/compilar.mjs';
import { empaquetar } from '../../scripts/paquete.mjs';

const temporal = await mkdtemp(path.join(os.tmpdir(), 'ranvier-paquete-'));
after(() => rm(temporal, { recursive: true, force: true }));

/** Lee un .zip (su directorio central) y devuelve sus archivos: nombre → contenido. */
function leerZip(zip) {
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(fin >= 0, 'el .zip tiene su final');
  const cuantos = zip.readUInt16LE(fin + 10);
  let posicion = zip.readUInt32LE(fin + 16);
  const archivos = new Map();
  for (let i = 0; i < cuantos; i++) {
    assert.equal(zip.readUInt32LE(posicion), 0x02014b50);
    const metodo = zip.readUInt16LE(posicion + 10);
    const crc = zip.readUInt32LE(posicion + 16);
    const comprimido = zip.readUInt32LE(posicion + 20);
    const largoDelNombre = zip.readUInt16LE(posicion + 28);
    const extra = zip.readUInt16LE(posicion + 30);
    const comentario = zip.readUInt16LE(posicion + 32);
    const local = zip.readUInt32LE(posicion + 42);
    const nombre = zip.subarray(posicion + 46, posicion + 46 + largoDelNombre).toString('utf8');
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const datos = zip.subarray(inicio, inicio + comprimido);
    const contenido = metodo === 8 ? zlib.inflateRawSync(datos) : Buffer.from(datos);
    assert.equal(zlib.crc32(contenido), crc, nombre);
    archivos.set(nombre, contenido);
    posicion += 46 + largoDelNombre + extra + comentario;
  }
  return archivos;
}

test('el .zip trae los mismos archivos que la compilación, con el manifiesto en la raíz', async () => {
  const carpeta = await compilar({ salida: path.join(temporal, 'dist') });
  const { destino, archivos } = await empaquetar(carpeta, path.join(temporal, 'paquete'));
  assert.match(path.basename(destino), /^ranvier-\d+\.\d+\.\d+\.zip$/);
  const enElZip = leerZip(await readFile(destino));
  assert.equal(enElZip.size, archivos);
  assert.ok(enElZip.has('manifest.json'));
  for (const nombre of enElZip.keys()) {
    assert.doesNotMatch(nombre, /\\|^\//, nombre);
    assert.deepEqual(enElZip.get(nombre), await readFile(path.join(carpeta, nombre)), nombre);
  }
  const todos = (await readdir(carpeta, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
  assert.equal(todos.length, enElZip.size);
});

test('el mismo código da el mismo .zip', async () => {
  const carpeta = path.join(temporal, 'dist');
  const a = await readFile((await empaquetar(carpeta, path.join(temporal, 'a'))).destino);
  const b = await readFile((await empaquetar(carpeta, path.join(temporal, 'b'))).destino);
  assert.ok(a.equals(b));
});

test('la compilación de desarrollo no se empaqueta', async () => {
  const carpeta = await compilar({ desarrollo: true, salida: path.join(temporal, 'desarrollo') });
  await assert.rejects(empaquetar(carpeta, path.join(temporal, 'no')), /desarrollo/);
});
