/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * Lo que el repositorio debe cumplir:
 * - los permisos son los mínimos: nada se lee antes del clic (`activeTab`), el puente solo va en la biblioteca de
 *   Mielina y el permiso de sitios es opcional;
 * - la interfaz no lleva el nombre ni el logotipo de Zotero (la descripción sí dice que usa sus traductores);
 * - la licencia AGPL: cada archivo lo dice, y los que vienen de Zotero dicen que se modificaron y cuándo (sección 5a);
 * - Ranvier no habla con los servidores de Zotero.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { RAIZ } from '../../scripts/compilar.mjs';

const leer = (...partes) => readFile(path.join(RAIZ, ...partes), 'utf8');

async function archivosDe(carpeta) {
  const lista = [];
  for (const entrada of await readdir(path.join(RAIZ, carpeta), { withFileTypes: true, recursive: true })) {
    if (entrada.isFile()) lista.push(path.relative(RAIZ, path.join(entrada.parentPath, entrada.name)).replaceAll('\\', '/'));
  }
  return lista.sort();
}

const manifiesto = JSON.parse(await leer('src', 'manifest.json'));

test('los permisos: activeTab, scripting, offscreen y storage; nada más', () => {
  assert.deepEqual([...manifiesto.permissions].sort(), ['activeTab', 'offscreen', 'scripting', 'storage']);
  assert.deepEqual(manifiesto.host_permissions, ['https://mielinapp.com/*']);
  assert.deepEqual(manifiesto.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifiesto.optional_permissions, undefined);
  assert.equal(JSON.stringify(manifiesto).includes('<all_urls>'), false);
});

test('el único script de contenido fijo es el puente, y solo en la biblioteca de Mielina', () => {
  assert.equal(manifiesto.content_scripts.length, 1);
  const [puente] = manifiesto.content_scripts;
  assert.deepEqual(puente.matches, ['https://mielinapp.com/biblioteca*']);
  assert.deepEqual(puente.js, ['comun/contrato.js', 'contenido/puenteMielina.js']);
  assert.equal(puente.all_frames, false);
  assert.equal(manifiesto.web_accessible_resources, undefined);
  assert.equal(manifiesto.externally_connectable, undefined);
});

test('los traductores corren en un marco aislado sin red; las páginas de la extensión no evalúan código', () => {
  assert.deepEqual(manifiesto.sandbox.pages, ['traductor/traductor.html']);
  const aislado = manifiesto.content_security_policy.sandbox;
  assert.match(aislado, /^sandbox allow-scripts;/);
  assert.match(aislado, /default-src 'none'/);
  assert.doesNotMatch(aislado, /connect-src|allow-same-origin|https?:/);
  assert.doesNotMatch(manifiesto.content_security_policy.extension_pages, /unsafe-eval|unsafe-inline|https?:/);
});

test('la interfaz no lleva el nombre de Zotero; la descripción dice que usa sus traductores', async () => {
  assert.doesNotMatch(`${manifiesto.name} ${manifiesto.short_name} ${manifiesto.action.default_title}`, /zotero/i);
  assert.match(manifiesto.description, /Usa los traductores de Zotero\.$/);
  for (const archivo of ['src/ventana/ventana.html', 'src/ventana/ventana.js', 'src/ventana/ventana.css']) {
    const sinComentarios = (await leer(archivo)).replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(sinComentarios, /zotero/i, archivo);
  }
  for (const icono of await archivosDe('src/iconos')) assert.doesNotMatch(icono, /zotero/i);
});

test('Ranvier no habla con los servidores de Zotero (los traductores van en el paquete)', async () => {
  for (const archivo of await archivosDe('src')) {
    if (!/\.(js|html|json)$/.test(archivo)) continue;
    assert.doesNotMatch(await leer(archivo), /https?:\/\/(repo|api|www)\.zotero\.org/, archivo);
  }
});

test('cada archivo de código dice su licencia: la AGPL', async () => {
  const archivos = [...await archivosDe('src'), ...await archivosDe('scripts'), ...await archivosDe('pruebas')]
    .filter((a) => /\.(m?js|html|css|svg)$/.test(a) && !a.startsWith('pruebas/e2e/paginas/') && !a.includes('/_'));
  for (const archivo of archivos) {
    const texto = await leer(archivo);
    assert.match(texto.slice(0, 1600), /Copyright ©/, archivo);
    assert.match(texto.slice(0, 1600), /AGPL|Affero/, archivo);
  }
});

test('los archivos que vienen de Zotero dicen que se modificaron, cuándo y qué cambió; el NOTICE los nombra', async () => {
  const aviso = await leer('NOTICE');
  const derivados = [];
  for (const archivo of await archivosDe('src')) {
    if (!/\.(js|html)$/.test(archivo)) continue;
    const texto = await leer(archivo);
    // Los que vienen de Zotero (los propios que solo toman una idea del conector lo dicen y no cuentan)
    if (!/derived from Zotero|This file is part of Zotero|MODIFICADO/.test(texto)) continue;
    derivados.push(archivo);
    assert.ok(aviso.includes(archivo), `El NOTICE debe nombrar ${archivo}`);
    if (archivo === 'src/traductor/translateWeb.js') {
      // Copia sin cambios: conserva la cabecera de Zotero
      assert.match(texto, /This file is part of Zotero/);
      assert.match(aviso, /src\/traductor\/translateWeb\.js: copia sin cambios/);
    } else {
      assert.match(texto, /MODIFICADO para Ranvier \(Mielina\) por Mario Esperanza|MODIFICADO el \d{2}-\d{2}-\d{4}/, archivo);
      assert.match(texto, /\d{2}-\d{2}-\d{4}/, archivo);
      assert.match(texto, /Cambios:/, archivo);
    }
  }
  assert.ok(derivados.length >= 7, derivados.join(', '));
});

test('la licencia, los avisos y el código fuente', async () => {
  const licencia = await leer('LICENSE');
  assert.match(licencia, /^\s*GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/);
  const paquete = JSON.parse(await leer('package.json'));
  assert.equal(paquete.license, 'AGPL-3.0-or-later');
  const leeme = await leer('README.md');
  assert.ok(leeme.includes('https://github.com/marioesperanzasorto-ops/ranvier'));
  assert.match(leeme, /traductores de Zotero/);
  assert.match(await leer('NOTICE'), /«Zotero» es una marca registrada/);
  const submodulos = await leer('.gitmodules');
  for (const repositorio of ['zotero/translate', 'zotero/utilities', 'zotero/translators', 'zotero/zotero-schema']) {
    assert.ok(submodulos.includes(`https://github.com/${repositorio}.git`), repositorio);
  }
});

test('la ficha y la privacidad dicen lo mismo que hace la extensión', async () => {
  const privacidad = await leer('docs', 'privacidad.md');
  assert.match(privacidad, /solo lee la página cuando haces clic/i);
  assert.match(privacidad, /manda la referencia solo a Mielina/i);
  const ficha = await leer('docs', 'ficha-de-la-tienda.md');
  for (const permiso of [...manifiesto.permissions, 'mielinapp.com', 'optional_host_permissions']) {
    assert.ok(ficha.includes(permiso), `La ficha debe justificar ${permiso}`);
  }
});
