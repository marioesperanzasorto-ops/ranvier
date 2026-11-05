/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * La compilación (`scripts/compilar.mjs`): el código de Zotero y los traductores van sin cambios (en sus commits
 * fijos), con el índice de los traductores y sus licencias; todo lo que cargan las páginas existe; la compilación de
 * las tiendas no lleva la Mielina de desarrollo.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compilar, leerTraductores, DE_TRANSLATE, DE_UTILITIES, RAIZ } from '../../scripts/compilar.mjs';

const temporal = await mkdtemp(path.join(os.tmpdir(), 'ranvier-compilar-'));
after(() => rm(temporal, { recursive: true, force: true }));

const tiendas = await compilar({ salida: path.join(temporal, 'tiendas') });
const desarrollo = await compilar({ desarrollo: true, salida: path.join(temporal, 'desarrollo') });

const leer = (carpeta, ...partes) => readFile(path.join(carpeta, ...partes));
const existe = (archivo) => stat(archivo).then(() => true, () => false);

test('los traductores: todos los que no solo exportan, sin cambios, con su índice', async () => {
  const delSubmodulo = await leerTraductores();
  const indice = JSON.parse(await leer(tiendas, 'traductores', 'indice.json'));
  assert.match(indice.commit, /^[0-9a-f]{40}$/);
  assert.equal(indice.traductores.length, delSubmodulo.length);
  assert.ok(indice.traductores.length > 500);
  for (const { info, archivo } of delSubmodulo) {
    assert.deepEqual(await leer(tiendas, 'traductores', `${info.translatorID}.js`), await readFile(archivo), info.label);
  }
  for (const t of indice.traductores) {
    assert.equal(t.code, undefined);
    assert.notEqual(t.translatorType, 2, `${t.label} solo exporta`);
  }
  const ids = new Set(indice.traductores.map((t) => t.translatorID));
  for (const [nombre, id] of [
    ['Embedded Metadata', '951c027d-74ac-47d4-a107-9c3069ab7b48'],
    ['COinS', '05d07af9-105a-4572-99f6-a8e231c0daef'],
    ['RIS', '32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7'],
    ['BibTeX', '9cb70025-a888-4a29-a210-93ec52da40d4'],
  ]) {
    assert.ok(ids.has(id), nombre);
  }
  const archivos = await readdir(path.join(tiendas, 'traductores'));
  assert.equal(archivos.length, indice.traductores.length + 1);
});

test('la arquitectura de traducción y las utilidades de Zotero, sin cambios y con su licencia; sin repo.js', async () => {
  for (const archivo of DE_TRANSLATE) {
    assert.deepEqual(await leer(tiendas, 'zotero', 'translate', archivo), await readFile(path.join(RAIZ, 'vendor', 'translate', 'src', archivo)), archivo);
  }
  for (const archivo of DE_UTILITIES) {
    assert.deepEqual(await leer(tiendas, 'zotero', 'utilities', archivo), await readFile(path.join(RAIZ, 'vendor', 'utilities', archivo)), archivo);
  }
  assert.ok(await existe(path.join(tiendas, 'zotero', 'translate', 'COPYING')));
  assert.ok(await existe(path.join(tiendas, 'zotero', 'utilities', 'COPYING')));
  assert.equal(await existe(path.join(tiendas, 'zotero', 'translate', 'repo.js')), false);
  assert.ok(await existe(path.join(tiendas, 'LICENSE')));
  assert.ok(await existe(path.join(tiendas, 'NOTICE')));
});

test('los datos del esquema y de las fechas', async () => {
  const esquema = (await leer(tiendas, 'datos', 'esquemaDeZotero.js')).toString();
  assert.match(esquema, /^\/\/ Generado por scripts\/compilar\.mjs/);
  assert.match(esquema, /globalThis\.RANVIER_ESQUEMA_DE_ZOTERO = \{"version":\d+,"csl":\{"types":/);
  const fechas = (await leer(tiendas, 'datos', 'formatosDeFecha.js')).toString();
  assert.match(fechas, /globalThis\.RANVIER_FORMATOS_DE_FECHA = \{/);
});

test('todo lo que cargan el manifiesto y las páginas existe', async () => {
  const manifiesto = JSON.parse(await leer(tiendas, 'manifest.json'));
  const referidos = [
    manifiesto.background.service_worker,
    manifiesto.action.default_popup,
    ...manifiesto.sandbox.pages,
    ...manifiesto.content_scripts.flatMap((c) => c.js),
    ...Object.values(manifiesto.icons),
    ...Object.values(manifiesto.action.default_icon),
    'fueraDePantalla/fueraDePantalla.html',
    'comun/pedir.js',
    'contenido/leerPagina.js',
  ];
  for (const pagina of ['traductor/traductor.html', 'fueraDePantalla/fueraDePantalla.html', 'ventana/ventana.html']) {
    const html = (await leer(tiendas, pagina)).toString();
    for (const [, src] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) referidos.push(path.posix.join(path.posix.dirname(pagina), src));
  }
  for (const archivo of referidos) assert.ok(await existe(path.join(tiendas, archivo)), archivo);
});

test('el manifiesto lleva la versión de package.json', async () => {
  const manifiesto = JSON.parse(await leer(tiendas, 'manifest.json'));
  const paquete = JSON.parse(await readFile(path.join(RAIZ, 'package.json'), 'utf8'));
  assert.equal(manifiesto.version, paquete.version);
  assert.match(manifiesto.version, /^\d+\.\d+\.\d+$/);
});

test('la compilación de las tiendas no lleva la Mielina de desarrollo; la de desarrollo, sí', async () => {
  const deTiendas = JSON.parse(await leer(tiendas, 'manifest.json'));
  assert.doesNotMatch(JSON.stringify(deTiendas), /localhost/);
  assert.doesNotMatch((await leer(tiendas, 'comun', 'config.js')).toString(), /^export const .*localhost/m);

  const deDesarrollo = JSON.parse(await leer(desarrollo, 'manifest.json'));
  assert.match(deDesarrollo.name, /desarrollo/);
  assert.deepEqual(deDesarrollo.content_scripts[0].matches, ['https://mielinapp.com/biblioteca*', 'http://localhost:3000/biblioteca*']);
  assert.deepEqual(deDesarrollo.host_permissions, ['https://mielinapp.com/*', 'http://localhost:3000/*']);
  const config = (await leer(desarrollo, 'comun', 'config.js')).toString();
  assert.match(config, /export const MIELINA = 'http:\/\/localhost:3000';/);
  assert.match(config, /export const MIELINAS = \['http:\/\/localhost:3000', 'https:\/\/mielinapp\.com'\];/);
});
