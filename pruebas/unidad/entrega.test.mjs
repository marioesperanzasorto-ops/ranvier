/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * La entrega a Mielina (`src/fondo/entrega.js`): se enfoca una biblioteca ya abierta con el puente vivo, o se abre una
 * nueva que pide el envío al cargar; la respuesta va a la insignia. Los datos son inventados.
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { chromeFalso } from './chromeFalso.mjs';

const { entregar, envioParaPestana, alResponderMielina, insigniaDelResultado, patronesDeLaBiblioteca } = await import('../../src/fondo/entrega.js');

const REFERENCIAS = [{ type: 'book', title: 'Historia de un pueblo que no existe', author: [{ family: 'Herrera', given: 'Julio' }] }];
const PAGINA = 'https://catalogo.ejemplo.edu/libro/12';
const ORIGEN = { id: 1, windowId: 1, url: PAGINA };

mock.timers.enable({ apis: ['setTimeout'] });

test('la biblioteca se busca en las mismas direcciones donde el manifiesto pone el puente', () => {
  assert.deepEqual(patronesDeLaBiblioteca(), ['https://mielinapp.com/biblioteca*']);
});

test('sin una biblioteca abierta: abre una pestaña nueva, que pide el envío al cargar', async () => {
  const chrome = chromeFalso({ pestanas: [ORIGEN, { id: 2, windowId: 1, url: 'https://mielinapp.com/editor' }] });
  const resultado = await entregar({ referencias: REFERENCIAS, pagina: PAGINA, pestanaOrigen: 1 });
  assert.equal(resultado.nueva, true);
  const creada = chrome.llamadas.find((l) => l.nombre === 'tabs.create');
  assert.deepEqual(creada.args, [{ url: 'https://mielinapp.com/biblioteca', active: true }]);
  // El editor de Mielina no se toca: no es la biblioteca
  assert.equal(chrome.llamadas.some((l) => l.nombre === 'tabs.sendMessage'), false);

  const envio = await envioParaPestana(resultado.pestana);
  assert.deepEqual(envio.referencias, REFERENCIAS);
  assert.equal(envio.pagina, PAGINA);
  assert.equal(await envioParaPestana(2), null);
});

test('con una biblioteca abierta y su puente vivo: se le entrega y se enfoca, sin abrir otra', async () => {
  const chrome = chromeFalso({
    pestanas: [ORIGEN, { id: 5, windowId: 2, url: 'https://mielinapp.com/biblioteca' }],
    respuestas: (id, mensaje) => (id === 5 && mensaje.tipo === 'ranvier/entregar' ? { recibido: true, vistaLista: true } : undefined),
  });
  const resultado = await entregar({ referencias: REFERENCIAS, pagina: PAGINA, pestanaOrigen: 1 });
  assert.deepEqual(resultado, { pestana: 5, nueva: false });
  assert.equal(chrome.llamadas.some((l) => l.nombre === 'tabs.create'), false);
  assert.deepEqual(chrome.llamadas.find((l) => l.nombre === 'tabs.update').args, [5, { active: true }]);
  assert.deepEqual(chrome.llamadas.find((l) => l.nombre === 'windows.update').args, [2, { focused: true }]);
  const [envio] = chrome.llamadas.filter((l) => l.nombre === 'tabs.sendMessage');
  assert.deepEqual(envio.args[1].envio.referencias, REFERENCIAS);
});

test('una biblioteca abierta antes de instalar Ranvier (sin puente): se abre otra', async () => {
  const chrome = chromeFalso({ pestanas: [ORIGEN, { id: 5, windowId: 1, url: 'https://mielinapp.com/biblioteca' }] });
  const resultado = await entregar({ referencias: REFERENCIAS, pagina: PAGINA, pestanaOrigen: 1 });
  assert.equal(resultado.nueva, true);
  assert.equal(chrome.llamadas.filter((l) => l.nombre === 'tabs.sendMessage').length, 1);
});

test('primero la biblioteca de la misma ventana', async () => {
  const chrome = chromeFalso({
    pestanas: [
      ORIGEN,
      { id: 5, windowId: 2, url: 'https://mielinapp.com/biblioteca', lastAccessed: 200 },
      { id: 6, windowId: 1, url: 'https://mielinapp.com/biblioteca?coleccion=3', lastAccessed: 100 },
    ],
    respuestas: () => ({ recibido: true }),
  });
  assert.deepEqual(await entregar({ referencias: REFERENCIAS, pagina: PAGINA, pestanaOrigen: 1 }), { pestana: 6, nueva: false });
  assert.equal(chrome.llamadas.find((l) => l.nombre === 'tabs.sendMessage').args[0], 6);
});

test('lo que no cabe en el contrato no se entrega', async () => {
  chromeFalso({ pestanas: [ORIGEN] });
  await assert.rejects(entregar({ referencias: [], pagina: PAGINA }), (e) => e.codigo === 'ninguna');
  await assert.rejects(entregar({ referencias: Array(201).fill(REFERENCIAS[0]), pagina: PAGINA }), (e) => e.codigo === 'demasiadas');
});

test('la respuesta de Mielina: se olvida el envío y va a la insignia de las dos pestañas', async () => {
  const chrome = chromeFalso({ pestanas: [ORIGEN] });
  const { pestana } = await entregar({ referencias: REFERENCIAS, pagina: PAGINA, pestanaOrigen: 1 });
  const envio = await envioParaPestana(pestana);

  assert.equal(await alResponderMielina({ id: 'otro', resultado: { guardadas: 1, yaEstaban: 0, omitidas: 0 } }, pestana), null);
  const respuesta = await alResponderMielina({ id: envio.id, resultado: { guardadas: 1, yaEstaban: 0, omitidas: 0 } }, pestana);
  assert.deepEqual(respuesta, { guardadas: 1, yaEstaban: 0, omitidas: 0 });
  assert.equal(await envioParaPestana(pestana), null);
  for (const id of [1, pestana]) {
    assert.equal(chrome.insignias.get(id).texto, '1');
    assert.match(chrome.insignias.get(id).titulo, /^Mielina guardó 1 referencia\./);
  }
  // Un minuto después, la insignia se borra
  mock.timers.tick(60e3);
  await new Promise((r) => setImmediate(r));
  assert.equal(chrome.insignias.get(1).texto, '');
});

test('una respuesta con datos raros no se acepta', async () => {
  chromeFalso({ pestanas: [ORIGEN] });
  const { pestana } = await entregar({ referencias: REFERENCIAS, pagina: PAGINA, pestanaOrigen: 1 });
  const envio = await envioParaPestana(pestana);
  assert.equal(await alResponderMielina({ id: envio.id, resultado: { guardadas: -3 } }, pestana), null);
  assert.ok(await envioParaPestana(pestana));
});

test('el texto de la insignia', () => {
  assert.deepEqual(insigniaDelResultado({ guardadas: 2, yaEstaban: 0, omitidas: 0 }), { texto: '2', titulo: 'Mielina guardó 2 referencias.', exito: true });
  assert.deepEqual(insigniaDelResultado({ guardadas: 0, yaEstaban: 1, omitidas: 0 }), { texto: '0', titulo: 'Mielina guardó 0 referencias; 1 ya estaba.', exito: false });
  assert.deepEqual(insigniaDelResultado({ guardadas: 1, yaEstaban: 2, omitidas: 1 }), { texto: '1', titulo: 'Mielina guardó 1 referencia; 2 ya estaban; 1 no se pudo guardar.', exito: true });
  assert.deepEqual(insigniaDelResultado({ cancelado: true }), { texto: '–', titulo: 'Mielina no guardó nada: se canceló.', exito: false });
});
