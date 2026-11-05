/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Arma las capturas de 1280 × 800 para la ficha de las tiendas (`tienda/`), con la extensión de verdad en Chrome for
 * Testing y las páginas de prueba (datos inventados): la ventana sobre un artículo y sobre una lista.
 *
 *   npm run capturas
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { prepararEntorno, hasta, textoDeLaVentana } from '../pruebas/e2e/navegador.mjs';
import { RAIZ } from './compilar.mjs';

/** Un poco de estilo para que las páginas de prueba parezcan las de una revista. */
const ESTILO = `
  body { font: 17px/1.6 Georgia, 'Times New Roman', serif; color: #222; background: #fbfaf7; margin: 0; }
  body::before { content: 'Revista Inventada de Ciencias'; display: block; background: #2b4a6f; color: #fff;
    font: 600 20px/1 system-ui, 'Segoe UI', sans-serif; padding: 22px 64px; }
  h1 { font-size: 34px; margin: 48px 64px 12px; max-width: 760px; }
  p, ol { margin: 12px 64px; max-width: 700px; }
  ol li { margin: 18px 0; }
`;

/** La ventana del botón, del tamaño que tiene (la de un clic no se puede cambiar de tamaño). */
async function fotoDeLaVentana(ventana) {
  const cuerpo = await ventana.$('body');
  return cuerpo.screenshot({ encoding: 'base64' });
}

/** La ventana sobre una lista, con dos referencias elegidas. */
async function capturaDeLista(entorno) {
  const pagina = await entorno.navegador.newPage();
  await pagina.setViewport({ width: 1280, height: 800 });
  await pagina.goto(`${entorno.servidores.paginas}/lista.html`);
  await pagina.addStyleTag({ content: ESTILO });
  const ventana = await entorno.hacerClic(pagina);
  await hasta(async () => (await textoDeLaVentana(ventana)).includes('tiene una lista'), { que: 'la lista' });
  const casillas = await ventana.$$('#opciones input');
  await casillas[0].click();
  await casillas[2].click();
  const fondo = await pagina.screenshot({ encoding: 'base64' });
  const imagenDeLaVentana = await fotoDeLaVentana(ventana);
  await ventana.close().catch(() => {});
  await pagina.close();
  return { fondo, imagenDeLaVentana };
}

/**
 * La ventana sobre un artículo, ya entregado. Al entregar, la ventana se cierra (se enfoca Mielina): se muestra su
 * panel «Listo», con el mismo texto, en la ventana abierta como página.
 */
async function capturaDeArticulo(entorno) {
  const pagina = await entorno.navegador.newPage();
  await pagina.setViewport({ width: 1280, height: 800 });
  await pagina.goto(`${entorno.servidores.paginas}/articulo.html`);
  await pagina.addStyleTag({ content: ESTILO });
  const fondo = await pagina.screenshot({ encoding: 'base64' });
  const ventana = await entorno.navegador.newPage();
  await ventana.setViewport({ width: 360, height: 400 });
  await ventana.goto(`chrome-extension://${entorno.extension.id}/ventana/ventana.html`);
  // Abierta como página, la ventana no tiene una pestaña que leer: se espera su aviso y se cambia por el panel «Listo»
  await hasta(async () => (await textoDeLaVentana(ventana)).includes('No puedo leer'), { que: 'la ventana' });
  await ventana.evaluate(() => {
    for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== 'listo';
    document.getElementById('listo-texto').textContent = 'Abrí tu biblioteca de Mielina. Revisa la referencia antes de guardarla: nada se guarda sin que lo confirmes.';
  });
  const imagenDeLaVentana = await fotoDeLaVentana(ventana);
  await ventana.close();
  await pagina.close();
  return { fondo, imagenDeLaVentana };
}

async function componer(navegador, { fondo, imagenDeLaVentana }, titulo, destino) {
  const icono = (await readFile(path.join(RAIZ, 'src', 'iconos', 'ranvier-32.png'))).toString('base64');
  const lienzo = await navegador.newPage();
  await lienzo.setViewport({ width: 1280, height: 800 });
  await lienzo.setContent(`<!doctype html><style>
    html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; font-family: system-ui, 'Segoe UI', sans-serif; }
    .barra { height: 44px; background: #dfe3e8; display: flex; align-items: center; gap: 12px; padding: 0 16px; }
    .direccion { flex: 1; background: #fff; border-radius: 16px; height: 28px; display: flex; align-items: center;
      padding: 0 14px; color: #555; font-size: 14px; }
    .barra img { width: 20px; height: 20px; outline: 2px solid #f0bc5e; outline-offset: 3px; border-radius: 2px; }
    .pagina { position: absolute; top: 44px; left: 0; width: 1280px; height: 756px; background: url(data:image/png;base64,${fondo}) top left no-repeat; }
    .ventana { position: absolute; top: 52px; right: 14px; box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.55); }
    .titulo { position: absolute; left: 64px; bottom: 40px; background: #15120e; color: #ede6da; padding: 14px 20px;
      font-size: 20px; max-width: 560px; border-left: 4px solid #f0bc5e; }
  </style>
  <div class="barra"><div class="direccion">revista.ejemplo.edu/articulo/7</div><img src="data:image/png;base64,${icono}" alt=""></div>
  <div class="pagina"></div>
  <img class="ventana" src="data:image/png;base64,${imagenDeLaVentana}" alt="">
  <div class="titulo">${titulo}</div>`);
  await lienzo.screenshot({ path: destino });
  await lienzo.close();
}

const entorno = await prepararEntorno();
try {
  entorno.servidores.estado.modo = 'callar';
  await componer(entorno.navegador, await capturaDeArticulo(entorno), 'Un clic, y la referencia va a tu biblioteca de Mielina.',
    path.join(RAIZ, 'tienda', 'captura-articulo-1280x800.png'));
  await componer(entorno.navegador, await capturaDeLista(entorno), 'En una lista, eliges qué referencias quieres.',
    path.join(RAIZ, 'tienda', 'captura-lista-1280x800.png'));
} finally {
  await entorno.cerrar();
}
console.log('Capturas listas en tienda/');
