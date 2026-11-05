/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * El puente en la biblioteca de Mielina (`src/contenido/puenteMielina.js`), con una ventana y un `chrome` falsos:
 * espera «mielina/lista», manda las referencias a la misma ventana y al mismo origen, y le pasa al fondo la respuesta.
 * Ignora los mensajes de otro origen o de otra ventana (un marco). Los datos son inventados.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { RAIZ } from '../../scripts/compilar.mjs';

await import('../../src/comun/contrato.js');
const C = globalThis.RanvierContrato;
const CODIGO = await readFile(path.join(RAIZ, 'src', 'contenido', 'puenteMielina.js'), 'utf8');
const ORIGEN = 'https://mielinapp.com';

const ENVIO = {
  id: 'envio-1',
  pagina: 'https://revista.ejemplo.edu/articulo/7',
  referencias: [{ type: 'book', title: 'Agua y comunidad en los valles altos', author: [{ family: 'Méndez', given: 'Laura' }] }],
};

const esperar = () => new Promise((r) => setTimeout(r, 0));
/** Los objetos del contexto del puente, como los de aquí (son de otro «realm»). */
const deAqui = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Carga el puente en una pestaña falsa. `envioAlCargar`: lo que responde el fondo a «ranvier/pedirEnvio». */
function cargarPuente({ envioAlCargar = null } = {}) {
  const oyentes = [];
  const alPuente = [];
  const window = {
    location: { origin: ORIGEN },
    publicados: [],
    addEventListener(tipo, fn) {
      if (tipo === 'message') oyentes.push(fn);
    },
    postMessage(datos, origen) {
      window.publicados.push({ datos: deAqui(datos), origen });
      // El navegador también se lo entrega a la misma ventana
      for (const fn of oyentes) fn({ data: structuredClone(datos), source: window, origin: ORIGEN });
    },
  };
  const alFondo = [];
  const chrome = {
    runtime: {
      id: 'ranvier',
      sendMessage(mensaje) {
        alFondo.push(deAqui(mensaje));
        return Promise.resolve(mensaje.tipo === 'ranvier/pedirEnvio' ? { envio: envioAlCargar } : { ok: true });
      },
      onMessage: { addListener: (fn) => alPuente.push(fn) },
    },
  };
  vm.runInNewContext(CODIGO, { window, chrome, RanvierContrato: C, structuredClone });
  return {
    window,
    alFondo,
    /** Un mensaje de la página (o de otro lado, con `source` y `origin`). */
    deLaPagina(datos, { source = window, origin = ORIGEN } = {}) {
      for (const fn of oyentes) fn({ data: datos, source, origin });
    },
    /** Un mensaje del fondo de la extensión. */
    delFondo(mensaje, remitente = { id: 'ranvier' }) {
      let respuesta;
      for (const fn of alPuente) fn(mensaje, remitente, (r) => {
        respuesta = r;
      });
      return deAqui(respuesta);
    },
    referenciasPublicadas: () => window.publicados.filter((p) => p.datos.tipo === 'mielina/referencias'),
  };
}

test('al cargar, pide al fondo si hay un envío para esta pestaña', async () => {
  const puente = cargarPuente();
  await esperar();
  assert.deepEqual(puente.alFondo, [{ tipo: 'ranvier/pedirEnvio' }]);
});

test('no manda nada hasta que la página avisa que está lista; entonces, el mensaje del contrato', async () => {
  const puente = cargarPuente();
  const respuesta = puente.delFondo({ tipo: 'ranvier/entregar', envio: ENVIO });
  assert.deepEqual(respuesta, { recibido: true, vistaLista: false });
  assert.equal(puente.referenciasPublicadas().length, 0);

  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  const publicadas = puente.referenciasPublicadas();
  assert.equal(publicadas.length, 1);
  assert.equal(publicadas[0].origen, ORIGEN);
  assert.deepEqual(publicadas[0].datos, {
    tipo: 'mielina/referencias',
    version: 1,
    formato: 'csl-json',
    pagina: ENVIO.pagina,
    referencias: ENVIO.referencias,
  });
});

test('si la página ya estaba lista, manda al instante', () => {
  const puente = cargarPuente();
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  assert.deepEqual(puente.delFondo({ tipo: 'ranvier/entregar', envio: ENVIO }), { recibido: true, vistaLista: true });
  assert.equal(puente.referenciasPublicadas().length, 1);
});

test('el envío que pidió al cargar se manda cuando la página está lista', async () => {
  const puente = cargarPuente({ envioAlCargar: ENVIO });
  await esperar();
  assert.equal(puente.referenciasPublicadas().length, 0);
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  assert.equal(puente.referenciasPublicadas().length, 1);
});

test('le pasa al fondo la respuesta de Mielina, una sola vez', async () => {
  const puente = cargarPuente();
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  puente.delFondo({ tipo: 'ranvier/entregar', envio: ENVIO });
  puente.deLaPagina({ tipo: 'mielina/recibidas', version: 1, guardadas: 1, yaEstaban: 0, omitidas: 0 });
  puente.deLaPagina({ tipo: 'mielina/recibidas', version: 1, guardadas: 1, yaEstaban: 0, omitidas: 0 });
  await esperar();
  const respuestas = puente.alFondo.filter((m) => m.tipo === 'ranvier/recibidas');
  assert.deepEqual(respuestas, [{ tipo: 'ranvier/recibidas', id: 'envio-1', resultado: { guardadas: 1, yaEstaban: 0, omitidas: 0 } }]);
});

test('también pasa «cancelado»', () => {
  const puente = cargarPuente();
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  puente.delFondo({ tipo: 'ranvier/entregar', envio: ENVIO });
  puente.deLaPagina({ tipo: 'mielina/recibidas', version: 1, cancelado: true });
  assert.deepEqual(puente.alFondo.at(-1), { tipo: 'ranvier/recibidas', id: 'envio-1', resultado: { cancelado: true } });
});

test('una respuesta sin envío no se pasa al fondo', () => {
  const puente = cargarPuente();
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  puente.deLaPagina({ tipo: 'mielina/recibidas', version: 1, guardadas: 3, yaEstaban: 0, omitidas: 0 });
  assert.equal(puente.alFondo.some((m) => m.tipo === 'ranvier/recibidas'), false);
});

test('ignora los mensajes de otro origen o de otra ventana (un marco)', () => {
  const puente = cargarPuente();
  puente.delFondo({ tipo: 'ranvier/entregar', envio: ENVIO });
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 }, { origin: 'https://otro.ejemplo.com' });
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 }, { source: { otro: 'marco' } });
  puente.deLaPagina({ tipo: 'mielina/lista', version: 2 });
  assert.equal(puente.referenciasPublicadas().length, 0);
});

test('ignora los mensajes que no vienen de la extensión', () => {
  const puente = cargarPuente();
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  assert.equal(puente.delFondo({ tipo: 'ranvier/entregar', envio: ENVIO }, { id: 'otra-extension' }), undefined);
  assert.equal(puente.referenciasPublicadas().length, 0);
});

test('si la página vuelve a avisar sin haber respondido, lo pendiente se manda otra vez', () => {
  const puente = cargarPuente();
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  puente.delFondo({ tipo: 'ranvier/entregar', envio: ENVIO });
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  assert.equal(puente.referenciasPublicadas().length, 2);
  puente.deLaPagina({ tipo: 'mielina/recibidas', version: 1, guardadas: 1, yaEstaban: 0, omitidas: 0 });
  puente.deLaPagina({ tipo: 'mielina/lista', version: 1 });
  assert.equal(puente.referenciasPublicadas().length, 2);
});
