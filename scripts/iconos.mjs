/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Pasa el ícono (`src/iconos/ranvier.svg`) a PNG en los tamaños del manifiesto, y arma las imágenes de la ficha de la
 * tienda (`tienda/`): el ícono de 128 y el mosaico de 440 × 280. Usa el Chrome de Puppeteer.
 *
 *   npm run iconos
 */

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { RAIZ } from './compilar.mjs';

const svg = await readFile(path.join(RAIZ, 'src', 'iconos', 'ranvier.svg'), 'utf8');
const navegador = await puppeteer.launch({ headless: true });
try {
  const pagina = await navegador.newPage();
  for (const lado of [16, 32, 48, 128]) {
    await pagina.setViewport({ width: lado, height: lado, deviceScaleFactor: 1 });
    await pagina.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${lado}px;height:${lado}px}</style>${svg}`);
    await pagina.screenshot({ path: path.join(RAIZ, 'src', 'iconos', `ranvier-${lado}.png`), omitBackground: true });
  }

  await mkdir(path.join(RAIZ, 'tienda'), { recursive: true });
  await pagina.setViewport({ width: 128, height: 128 });
  await pagina.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:96px;height:96px;margin:16px}</style>${svg}`);
  await pagina.screenshot({ path: path.join(RAIZ, 'tienda', 'icono-128.png'), omitBackground: true });

  await pagina.setViewport({ width: 440, height: 280 });
  await pagina.setContent(`<!doctype html><style>
    html,body{margin:0;width:440px;height:280px;background:#15120E;color:#EDE6DA;font-family:Georgia,'Times New Roman',serif}
    .t{display:flex;align-items:center;gap:22px;padding:58px 40px 0}
    svg{width:96px;height:96px;flex:none}
    h1{margin:0;font-size:40px;font-weight:600}
    p{margin:6px 0 0;font:16px/1.4 system-ui,'Segoe UI',sans-serif;color:#A39887}
    .l{position:absolute;left:40px;right:40px;bottom:46px;font:15px/1.4 system-ui,'Segoe UI',sans-serif;color:#F0BC5E}
  </style><div class="t">${svg}<div><h1>Ranvier</h1><p>para Mielina</p></div></div>
  <div class="l">La referencia de la página que lees, a tu biblioteca.</div>`);
  await pagina.screenshot({ path: path.join(RAIZ, 'tienda', 'mosaico-440x280.png') });
} finally {
  await navegador.close();
}
console.log('Íconos listos en src/iconos/ y tienda/');
