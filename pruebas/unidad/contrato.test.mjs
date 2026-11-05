/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * El contrato con Mielina, versión 1 (`src/comun/contrato.js` y `docs/contrato-del-recolector.md`): los mensajes
 * tienen exactamente la forma del documento, y se respetan sus límites. Los datos son inventados.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RAIZ } from '../../scripts/compilar.mjs';

await import('../../src/comun/contrato.js');
const C = globalThis.RanvierContrato;

const REFERENCIA = {
  type: 'article-journal',
  title: 'El huerto escolar como laboratorio',
  'container-title': 'Revista Inventada de Ciencias',
  author: [{ family: 'Campos', given: 'Elena' }],
  issued: { 'date-parts': [[2024]] },
};

test('el mensaje con las referencias tiene la forma del contrato', () => {
  assert.deepEqual(C.mensajeDeReferencias([REFERENCIA], 'https://revista.ejemplo.edu/articulo/7'), {
    tipo: 'mielina/referencias',
    version: 1,
    formato: 'csl-json',
    pagina: 'https://revista.ejemplo.edu/articulo/7',
    referencias: [REFERENCIA],
  });
});

test('«pagina» solo va si es http o https, y sin lo que va después de #', () => {
  assert.equal(C.mensajeDeReferencias([REFERENCIA], 'https://ejemplo.edu/a#parte').pagina, 'https://ejemplo.edu/a');
  assert.equal(C.mensajeDeReferencias([REFERENCIA], 'http://ejemplo.edu/a').pagina, 'http://ejemplo.edu/a');
  for (const mala of ['javascript:alert(1)', 'file:///C:/a.html', 'chrome://extensions', 'no es una dirección', undefined, 42, `https://ejemplo.edu/${'a'.repeat(2100)}`]) {
    assert.equal('pagina' in C.mensajeDeReferencias([REFERENCIA], mala), false, String(mala).slice(0, 40));
  }
});

test('«mielina/lista»: solo el tipo y la versión del contrato', () => {
  assert.equal(C.esLista({ tipo: 'mielina/lista', version: 1 }), true);
  assert.equal(C.esLista({ tipo: 'mielina/lista', version: 2 }), false);
  assert.equal(C.esLista({ tipo: 'mielina/lista', version: '1' }), false);
  assert.equal(C.esLista({ tipo: 'mielina/recibidas', version: 1 }), false);
  assert.equal(C.esLista([{ tipo: 'mielina/lista', version: 1 }]), false);
  assert.equal(C.esLista(null), false);
  assert.equal(C.esLista('mielina/lista'), false);
});

test('«mielina/recibidas»: lo guardado, o cancelado', () => {
  assert.deepEqual(C.leerRecibidas({ tipo: 'mielina/recibidas', version: 1, guardadas: 2, yaEstaban: 1, omitidas: 0 }), { guardadas: 2, yaEstaban: 1, omitidas: 0 });
  assert.deepEqual(C.leerRecibidas({ tipo: 'mielina/recibidas', version: 1, cancelado: true }), { cancelado: true });
});

test('«mielina/recibidas» con otra versión o cuentas raras se ignora', () => {
  for (const malo of [
    { tipo: 'mielina/recibidas', version: 2, guardadas: 1, yaEstaban: 0, omitidas: 0 },
    { tipo: 'mielina/recibidas', version: 1, guardadas: -1, yaEstaban: 0, omitidas: 0 },
    { tipo: 'mielina/recibidas', version: 1, guardadas: 1.5, yaEstaban: 0, omitidas: 0 },
    { tipo: 'mielina/recibidas', version: 1, guardadas: '1', yaEstaban: 0, omitidas: 0 },
    { tipo: 'mielina/recibidas', version: 1, guardadas: 1 },
    { tipo: 'mielina/recibidas', version: 1, cancelado: 'sí' },
    { tipo: 'mielina/lista', version: 1 },
    null,
  ]) {
    assert.equal(C.leerRecibidas(malo), null, JSON.stringify(malo));
  }
});

test('de 1 a 200 referencias', () => {
  assert.deepEqual(C.revisarEnvio([], 'https://ejemplo.edu'), { ok: false, motivo: 'ninguna' });
  assert.deepEqual(C.revisarEnvio(null), { ok: false, motivo: 'ninguna' });
  assert.deepEqual(C.revisarEnvio([REFERENCIA, 'no es un objeto']), { ok: false, motivo: 'ninguna' });
  assert.deepEqual(C.revisarEnvio([REFERENCIA]), { ok: true });
  assert.deepEqual(C.revisarEnvio(Array(200).fill(REFERENCIA)), { ok: true });
  assert.deepEqual(C.revisarEnvio(Array(201).fill(REFERENCIA)), { ok: false, motivo: 'demasiadas' });
});

test('como mucho 5 MB de JSON', () => {
  const grande = { ...REFERENCIA, abstract: 'a'.repeat(C.MAX_CARACTERES) };
  assert.deepEqual(C.revisarEnvio([grande]), { ok: false, motivo: 'muyGrande' });
  const justo = { ...REFERENCIA, abstract: 'a'.repeat(C.MAX_CARACTERES - 1000) };
  assert.deepEqual(C.revisarEnvio([justo]), { ok: true });
});

test('los límites y los mensajes son los del documento público del contrato', async () => {
  const documento = await readFile(path.join(RAIZ, 'docs', 'contrato-del-recolector.md'), 'utf8');
  assert.match(documento, /versión 1/);
  assert.match(documento, /De 1 a 200 referencias, y como mucho 5 MB de JSON/);
  assert.equal(C.MAX_REFERENCIAS, 200);
  assert.equal(C.MAX_CARACTERES, 5 * 1024 * 1024);
  for (const mensaje of ['{ "tipo": "mielina/lista", "version": 1 }', '"tipo": "mielina/referencias"', '"formato": "csl-json"', '"tipo": "mielina/recibidas"']) {
    assert.ok(documento.includes(mensaje), mensaje);
  }
  assert.ok(documento.includes(`https://mielinapp.com${C.RUTA_DE_LA_BIBLIOTECA}`));
});
