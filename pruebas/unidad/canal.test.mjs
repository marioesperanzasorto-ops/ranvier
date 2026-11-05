/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * El canal entre el documento fuera de pantalla y el marco aislado de los traductores (`src/comun/canal.js`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

await import('../../src/comun/canal.js');
const { Canal } = globalThis.RanvierCanal;

function par(funcionesA = {}, funcionesB = {}) {
  const { port1, port2 } = new MessageChannel();
  const a = new Canal(port1, funcionesA);
  const b = new Canal(port2, funcionesB);
  return { a, b, cerrar: () => { a.cerrar(); b.cerrar(); } };
}

test('una llamada devuelve lo que responde el otro lado, también si es asíncrono', async () => {
  const { a, cerrar } = par({}, { sumar: (x, y) => x + y, tarde: async (t) => `listo: ${t}` });
  try {
    assert.equal(await a.llamar('sumar', 2, 3), 5);
    assert.equal(await a.llamar('tarde', 'sí'), 'listo: sí');
  } finally {
    cerrar();
  }
});

test('los dos lados pueden llamar, y las llamadas se cruzan sin mezclarse', async () => {
  const { a, b, cerrar } = par({ eco: (v) => `a:${v}` }, { eco: (v) => `b:${v}` });
  try {
    const resultados = await Promise.all([a.llamar('eco', 1), b.llamar('eco', 2), a.llamar('eco', 3)]);
    assert.deepEqual(resultados, ['b:1', 'a:2', 'b:3']);
  } finally {
    cerrar();
  }
});

test('un error del otro lado llega como error, con su código', async () => {
  const { a, cerrar } = par({}, {
    fallar: () => {
      const e = new Error('No se pudo');
      e.codigo = 'prueba';
      throw e;
    },
  });
  try {
    await assert.rejects(a.llamar('fallar'), (e) => e.message === 'No se pudo' && e.codigo === 'prueba');
  } finally {
    cerrar();
  }
});

test('solo se pueden llamar las funciones que el otro lado ofrece', async () => {
  const { a, cerrar } = par({}, { ofrecida: () => 1 });
  try {
    await assert.rejects(a.llamar('noOfrecida'), /no ofrece/);
    await assert.rejects(a.llamar('toString'), /no ofrece/);
    await assert.rejects(a.llamar('__proto__'), /no ofrece/);
  } finally {
    cerrar();
  }
});

test('al cerrar, lo que esperaba respuesta falla y no se puede llamar más', async () => {
  const { port1, port2 } = new MessageChannel();
  const a = new Canal(port1, {});
  const b = new Canal(port2, { nunca: () => new Promise(() => {}) });
  const pendiente = a.llamar('nunca');
  a.cerrar('Se cerró');
  await assert.rejects(pendiente, /Se cerró/);
  await assert.rejects(a.llamar('nunca'), /cerrado/);
  b.cerrar();
});
