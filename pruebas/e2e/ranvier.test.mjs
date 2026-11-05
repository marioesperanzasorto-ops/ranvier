/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * De punta a punta, con Chrome for Testing (el de Puppeteer) y la extensión sin empaquetar: el clic en el botón
 * (`triggerExtensionAction`, como el del estudiante, con `activeTab`), los traductores de Zotero en el marco aislado,
 * la conversión a CSL-JSON y la entrega a una Mielina falsa que cumple el contrato. Los datos son inventados.
 */

import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEntorno, hasta, textoDeLaVentana } from './navegador.mjs';

let entorno;
before(async () => {
  entorno = await prepararEntorno();
});
after(() => entorno?.cerrar());

/** Cada prueba empieza sin pestañas de las anteriores (aunque hayan fallado). */
beforeEach(async () => {
  for (const pagina of await entorno.navegador.pages()) {
    if (!pagina.url().startsWith('about:')) await pagina.close().catch(() => {});
  }
});

/** Abre una página de prueba en una pestaña nueva. */
async function abrir(nombre) {
  const pagina = await entorno.navegador.newPage();
  await pagina.goto(`${entorno.servidores.paginas}/${nombre}`);
  return pagina;
}

/** Espera a que la Mielina falsa reciba un mensaje y lo devuelve (con su pestaña). */
async function loQueRecibioMielina() {
  const mielina = await hasta(() => entorno.pestanaDeMielina(), { que: 'la pestaña de Mielina' });
  const recibidos = await hasta(() => mielina.evaluate(() => window.recibidos?.length && window.recibidos), { que: 'las referencias en Mielina' });
  return { mielina, recibidos };
}

async function cerrarMielina() {
  const mielina = await entorno.pestanaDeMielina();
  await mielina?.close();
}

/** El id de la pestaña de una página, desde el fondo de la extensión. */
async function idDePestana(pagina) {
  const fondo = await entorno.fondo();
  const url = pagina.url();
  // La más reciente con esa dirección
  return fondo.evaluate(async (u) => Math.max(...(await chrome.tabs.query({})).filter((t) => t.url === u).map((t) => t.id)), url);
}

async function insignia(pagina) {
  const fondo = await entorno.fondo();
  const tabId = await idDePestana(pagina);
  return fondo.evaluate(async (id) => ({ texto: await chrome.action.getBadgeText({ tabId: id }), titulo: await chrome.action.getTitle({ tabId: id }) }), tabId);
}

test('antes del clic no se lee nada: la página no tiene ningún script de Ranvier', async () => {
  const pagina = await abrir('articulo.html');
  assert.equal((await pagina.mainFrame().extensionRealms()).length, 0);
  await pagina.close();
});

test('un artículo con citation_*: llega a Mielina en CSL-JSON, con la dirección de la página', async () => {
  const pagina = await abrir('articulo.html');
  const ventana = await entorno.hacerClic(pagina);
  await hasta(async () => (await pagina.mainFrame().extensionRealms()).length > 0, { que: 'que Ranvier lea la página después del clic' });

  const { mielina, recibidos } = await loQueRecibioMielina();
  assert.equal(recibidos.length, 1);
  const [mensaje] = recibidos;
  assert.equal(mensaje.tipo, 'mielina/referencias');
  assert.equal(mensaje.version, 1);
  assert.equal(mensaje.formato, 'csl-json');
  assert.equal(mensaje.pagina, `${entorno.servidores.paginas}/articulo.html`);
  assert.equal(mensaje.referencias.length, 1);
  const [ref] = mensaje.referencias;
  assert.equal(ref.type, 'article-journal');
  assert.equal(ref.title, 'El huerto escolar como laboratorio');
  assert.deepEqual(ref.author, [{ family: 'Campos', given: 'Elena' }, { family: 'Rivas Quintanilla', given: 'Tomás' }]);
  assert.equal(ref['container-title'], 'Revista Inventada de Ciencias');
  assert.equal(ref.volume, '4');
  assert.equal(ref.issue, '1');
  assert.equal(ref.page, '10-22');
  assert.deepEqual(ref.issued, { 'date-parts': [['2024', 3, 15]] });
  assert.equal(ref.URL, `${entorno.servidores.paginas}/articulo.html`);
  assert.ok(ref.accessed?.['date-parts'], 'la fecha de consulta');

  // La respuesta de Mielina, en la insignia de las dos pestañas
  for (const p of [pagina, mielina]) {
    const { texto, titulo } = await hasta(async () => {
      const i = await insignia(p);
      return i.texto && i;
    }, { que: 'la insignia' });
    assert.equal(texto, '1');
    assert.match(titulo, /^Mielina guardó 1 referencia\./);
  }
  await ventana.close().catch(() => {});
  await cerrarMielina();
  await pagina.close();
});

test('una lista: el estudiante elige en la ventana, y solo llegan las elegidas, en orden', async () => {
  const pagina = await abrir('lista.html');
  const ventana = await entorno.hacerClic(pagina);
  await hasta(async () => (await textoDeLaVentana(ventana)).includes('Esta página tiene una lista'), { que: 'la lista' });
  const titulos = await ventana.$$eval('#opciones label', (ls) => ls.map((l) => l.textContent.trim()));
  assert.deepEqual(titulos, ['Las abejas nativas del bosque seco', 'Historia de un pueblo que no existe', 'Mapas de lluvia hechos a mano']);
  assert.equal(await ventana.$eval('#mandar', (b) => b.disabled), true);

  const casillas = await ventana.$$('#opciones input');
  await casillas[0].click();
  await casillas[2].click();
  assert.equal(await ventana.$eval('#mandar', (b) => b.textContent), 'Mandar 2 a Mielina');
  await ventana.click('#mandar');

  const { recibidos } = await loQueRecibioMielina();
  const referencias = recibidos[0].referencias;
  assert.deepEqual(referencias.map((r) => r.title), ['Las abejas nativas del bosque seco', 'Mapas de lluvia hechos a mano']);
  assert.deepEqual(referencias[0].author, [{ family: 'Ortiz', given: 'Marisol' }]);
  assert.equal(referencias[0]['container-title'], 'Boletín Inventado de Ecología');
  await cerrarMielina();
  await pagina.close();
});

test('una lista sin elegir nada: no se manda nada', async () => {
  const pagina = await abrir('lista.html');
  const ventana = await entorno.hacerClic(pagina);
  await hasta(async () => (await textoDeLaVentana(ventana)).includes('Esta página tiene una lista'), { que: 'la lista' });
  await ventana.click('#cancelar');
  const texto = await hasta(async () => {
    const t = await textoDeLaVentana(ventana);
    return t.includes('No elegiste') && t;
  }, { que: 'el aviso' });
  assert.match(texto, /No se mandó nada a Mielina/);
  assert.equal(await entorno.pestanaDeMielina(), null);
  await ventana.close();
  await pagina.close();
});

test('unAPI: el traductor pide al mismo sitio desde la página (con su sesión) y lee el RIS', async () => {
  entorno.servidores.estado.peticionesUnapi.length = 0;
  const pagina = await abrir('unapi.html');
  await entorno.hacerClic(pagina);
  const { recibidos } = await loQueRecibioMielina();
  const [ref] = recibidos[0].referencias;
  assert.equal(ref.type, 'book');
  assert.equal(ref.title, 'Agua y comunidad en los valles altos');
  assert.deepEqual(ref.author, [{ family: 'Méndez', given: 'Laura' }]);
  assert.equal(ref.publisher, 'Editorial Ficticia');
  assert.equal(ref['publisher-place'], 'Santa Ana');
  const peticiones = entorno.servidores.estado.peticionesUnapi;
  assert.ok(peticiones.length >= 2);
  assert.ok(peticiones.every((p) => p.cookie.includes('sesion=prueba')), 'las peticiones llevan la cookie del sitio');
  await cerrarMielina();
  await pagina.close();
});

test('con la biblioteca ya abierta: se usa esa pestaña, sin abrir otra', async () => {
  const biblioteca = await entorno.navegador.newPage();
  await biblioteca.goto(`${entorno.servidores.mielina}/biblioteca`);
  await hasta(async () => (await biblioteca.mainFrame().extensionRealms()).length > 0, { que: 'el puente' });
  const pagina = await abrir('articulo.html');
  const pestanasAntes = (await entorno.navegador.pages()).length;
  await entorno.hacerClic(pagina);
  const recibidos = await hasta(() => biblioteca.evaluate(() => window.recibidos.length && window.recibidos), { que: 'las referencias' });
  assert.equal(recibidos[0].referencias[0].title, 'El huerto escolar como laboratorio');
  const paginas = (await entorno.navegador.pages()).filter((p) => p.url().startsWith(`${entorno.servidores.mielina}/biblioteca`));
  assert.equal(paginas.length, 1);
  assert.ok((await entorno.navegador.pages()).length <= pestanasAntes + 1, 'solo la ventana del botón');
  await biblioteca.close();
  await pagina.close();
});

test('si Mielina cancela, la insignia lo dice', async () => {
  entorno.servidores.estado.modo = 'cancelar';
  try {
    const pagina = await abrir('articulo.html');
    await entorno.hacerClic(pagina);
    await loQueRecibioMielina();
    const { texto, titulo } = await hasta(async () => {
      const i = await insignia(pagina);
      return i.texto && i;
    }, { que: 'la insignia' });
    assert.equal(texto, '–');
    assert.match(titulo, /^Mielina no guardó nada: se canceló\./);
    await cerrarMielina();
    await pagina.close();
  } finally {
    entorno.servidores.estado.modo = 'guardar';
  }
});

test('si un traductor pide datos a otro sitio sin CORS y no hay permiso: la ventana lo pide, y no se abre Mielina', async () => {
  entorno.servidores.estado.peticionesDelOtroSitio.length = 0;
  const pagina = await abrir('unapi-de-otro-sitio.html');
  const ventana = await entorno.hacerClic(pagina);
  const texto = await hasta(async () => {
    const t = await textoDeLaVentana(ventana);
    return t.includes('Falta un permiso') && t;
  }, { que: 'el aviso del permiso' });
  assert.match(texto, /trae los datos de la referencia de otro sitio \(127\.0\.0\.1\)/);
  assert.match(texto, /Se pide una sola vez/);
  assert.equal(await ventana.$eval('#dar-permiso', (b) => b.hidden), false);
  assert.equal(await entorno.pestanaDeMielina(), null);
  // Sin el permiso, la extensión no pudo leer la respuesta del otro sitio (el navegador la bloquea por CORS)
  const fondo = await entorno.fondo();
  assert.equal(await fondo.evaluate(() => chrome.permissions.contains({ origins: ['http://*/*'] })), false);
  await ventana.close();
  await pagina.close();
});

test('una página sin referencia: la ventana lo explica y no se abre Mielina', async () => {
  const pagina = await abrir('vacia.html');
  const ventana = await entorno.hacerClic(pagina);
  const texto = await hasta(async () => {
    const t = await textoDeLaVentana(ventana);
    return t.includes('No encontré') && t;
  }, { que: 'el aviso' });
  assert.match(texto, /No encontré una referencia aquí/);
  assert.equal(await entorno.pestanaDeMielina(), null);
  await ventana.close();
  await pagina.close();
});

test('el puente solo está en la biblioteca de Mielina', async () => {
  const otra = await entorno.navegador.newPage();
  await otra.goto(`${entorno.servidores.mielina}/otra`);
  assert.equal((await otra.mainFrame().extensionRealms()).length, 0);
  await otra.close();
});
