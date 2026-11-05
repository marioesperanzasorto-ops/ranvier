/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * Las peticiones HTTP de los traductores: cómo se hacen (`src/comun/pedir.js`) y por dónde salen
 * (`src/fondo/http.js`): primero desde la página; desde la extensión solo con el permiso de sitios; nunca a Zotero.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromeFalso } from './chromeFalso.mjs';

await import('../../src/comun/pedir.js');
const { pedirParaTraductor, esDeZotero } = await import('../../src/fondo/http.js');
const { pedir } = globalThis.RanvierPedir;

let servidor;
let base;
before(async () => {
  servidor = createServer((pedido, respuesta) => {
    const url = new URL(pedido.url, 'http://127.0.0.1');
    if (url.pathname === '/latin1') {
      respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=ISO-8859-1' });
      respuesta.end(Buffer.from('<p>Año de publicación</p>', 'latin1'));
    } else if (url.pathname === '/meta') {
      respuesta.writeHead(200, { 'Content-Type': 'text/html' });
      respuesta.end(Buffer.concat([Buffer.from('<html><head><meta charset="windows-1252"></head><body>'), Buffer.from('Peña', 'latin1'), Buffer.from('</body></html>')]));
    } else if (url.pathname === '/binario') {
      respuesta.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      respuesta.end(Buffer.from([0, 255, 128, 7]));
    } else if (url.pathname === '/lento') {
      setTimeout(() => respuesta.end('tarde'), 2000);
    } else if (url.pathname === '/eco') {
      let cuerpo = '';
      pedido.on('data', (d) => { cuerpo += d; });
      pedido.on('end', () => {
        respuesta.writeHead(201, { 'Content-Type': 'application/json', 'X-Prueba': 'sí' });
        respuesta.end(JSON.stringify({ metodo: pedido.method, cuerpo, accept: pedido.headers.accept, tipo: pedido.headers['content-type'] }));
      });
    } else {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain' });
      respuesta.end('no está');
    }
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => new Promise((r) => servidor.close(r)));

test('pedir: el método, el cuerpo, las cabeceras y el estado', async () => {
  const r = await pedir({ metodo: 'POST', url: `${base}/eco`, cuerpo: 'a=1', cabeceras: { Accept: 'application/x-bibtex', 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 201);
  assert.deepEqual(JSON.parse(r.texto), { metodo: 'POST', cuerpo: 'a=1', accept: 'application/x-bibtex', tipo: 'application/x-www-form-urlencoded' });
  assert.match(r.cabeceras, /^x-prueba: sí\r$/m);
  assert.equal(r.url, `${base}/eco`);
});

test('pedir: un 404 es una respuesta (el traductor decide), no un fallo', async () => {
  const r = await pedir({ metodo: 'GET', url: `${base}/nada` });
  assert.equal(r.status, 404);
  assert.equal(r.texto, 'no está');
});

test('pedir: el juego de caracteres de la cabecera o del <meta>', async () => {
  assert.match((await pedir({ metodo: 'GET', url: `${base}/latin1` })).texto, /Año de publicación/);
  assert.match((await pedir({ metodo: 'GET', url: `${base}/meta` })).texto, /Peña/);
});

test('pedir: lo binario va en base64', async () => {
  const r = await pedir({ metodo: 'GET', url: `${base}/binario`, binario: true });
  assert.deepEqual([...Buffer.from(r.base64, 'base64')], [0, 255, 128, 7]);
});

test('pedir: se agota el tiempo', async () => {
  assert.deepEqual(await pedir({ metodo: 'GET', url: `${base}/lento`, tiempo: 200 }), { tiempoAgotado: true });
});

test('pedir: solo http y https, y los métodos de siempre', async () => {
  assert.match((await pedir({ metodo: 'GET', url: 'file:///C:/Windows/win.ini' })).fallo, /file:/);
  assert.match((await pedir({ metodo: 'DELETE', url: `${base}/eco` })).fallo, /DELETE/);
});

test('un traductor pide a su mismo sitio: sale desde la página', async () => {
  const chrome = chromeFalso({ respuestas: () => ({ status: 200, texto: 'desde la página', url: 'https://revista.ejemplo.edu/ris' }) });
  const operacion = { pestanaId: 7, urlDelDocumento: 'https://revista.ejemplo.edu/articulo/7' };
  const r = await pedirParaTraductor({ metodo: 'GET', url: 'https://revista.ejemplo.edu/ris' }, operacion);
  assert.equal(r.texto, 'desde la página');
  const [envio] = chrome.llamadas.filter((l) => l.nombre === 'tabs.sendMessage');
  assert.deepEqual(envio.args, [7, { tipo: 'ranvier/pedir', peticion: { metodo: 'GET', url: 'https://revista.ejemplo.edu/ris' } }, { frameId: 0 }]);
  assert.equal(operacion.faltaPermiso, undefined);
});

test('a otro sitio que lo permite (CORS): también desde la página, sin permiso', async () => {
  chromeFalso({ respuestas: () => ({ status: 200, texto: '{}' }) });
  const operacion = { pestanaId: 7, urlDelDocumento: 'https://revista.ejemplo.edu/articulo/7' };
  const r = await pedirParaTraductor({ metodo: 'GET', url: 'https://api.ejemplo.org/obras/1' }, operacion);
  assert.equal(r.texto, '{}');
  assert.equal(operacion.faltaPermiso, undefined);
});

test('a otro sitio que no lo permite, sin el permiso: falla y la operación lo anota', async () => {
  const chrome = chromeFalso({ respuestas: () => ({ fallo: 'Failed to fetch' }) });
  const operacion = { pestanaId: 7, urlDelDocumento: 'https://revista.ejemplo.edu/articulo/7' };
  const r = await pedirParaTraductor({ metodo: 'GET', url: 'https://datos.ejemplo.org/x' }, operacion);
  assert.deepEqual(r, { fallo: 'Failed to fetch' });
  assert.equal(operacion.faltaPermiso, 'datos.ejemplo.org');
  assert.deepEqual(chrome.llamadas.find((l) => l.nombre === 'permissions.contains').args, [['https://datos.ejemplo.org/*']]);
});

test('a otro sitio que no lo permite, con el permiso: sale desde la extensión', async () => {
  chromeFalso({ permisos: ['*'], respuestas: () => ({ fallo: 'Failed to fetch' }) });
  const operacion = { pestanaId: 7, urlDelDocumento: 'https://revista.ejemplo.edu/articulo/7' };
  const r = await pedirParaTraductor({ metodo: 'GET', url: `${base}/eco` }, operacion);
  assert.equal(r.status, 201);
  assert.equal(operacion.faltaPermiso, undefined);
});

test('si falla una petición a su mismo sitio, no se pide permiso (es la red)', async () => {
  chromeFalso({ respuestas: () => ({ fallo: 'net::ERR_CONNECTION_RESET' }) });
  const operacion = { pestanaId: 7, urlDelDocumento: 'https://revista.ejemplo.edu/articulo/7' };
  const r = await pedirParaTraductor({ metodo: 'GET', url: 'https://revista.ejemplo.edu/ris' }, operacion);
  assert.equal(r.fallo, 'net::ERR_CONNECTION_RESET');
  assert.equal(operacion.faltaPermiso, undefined);
});

test('nunca se habla con Zotero, ni con direcciones que no son http', async () => {
  const chrome = chromeFalso({ permisos: ['*'], respuestas: () => ({ status: 200, texto: 'no debería' }) });
  const operacion = { pestanaId: 7, urlDelDocumento: 'https://revista.ejemplo.edu/articulo/7' };
  for (const url of ['https://repo.zotero.org/repo/metadata', 'https://api.zotero.org/users/1/items', 'https://www.zotero.org/repo/report', 'https://zotero.org/']) {
    assert.match((await pedirParaTraductor({ metodo: 'GET', url }, operacion)).fallo, /Zotero/, url);
  }
  for (const url of ['file:///C:/a.txt', 'chrome://settings', 'javascript:alert(1)', 'no es una dirección']) {
    assert.ok((await pedirParaTraductor({ metodo: 'GET', url }, operacion)).fallo, url);
  }
  assert.equal(chrome.llamadas.filter((l) => l.nombre === 'tabs.sendMessage').length, 0);
  assert.equal(esDeZotero('https://zotero.org.ejemplo.edu/'), false);
  assert.equal(esDeZotero('https://notzotero.org/'), false);
});
