/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Pasa el ícono (`src/iconos/ranvier.svg`) a PNG en los tamaños del manifiesto, y arma las imágenes de la ficha de la
 * tienda (`tienda/`): el ícono de 128, el mosaico de 440 × 280 y la marquesina de 1400 × 560. Usa el Chrome de
 * Puppeteer.
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

  // La marquesina de 1400 × 560 (Chrome). Como el mosaico, sin transparencia: la tienda pide PNG de 24 bits.
  await pagina.setViewport({ width: 1400, height: 560 });
  await pagina.setContent(`<!doctype html><style>
    html,body{margin:0;width:1400px;height:560px;overflow:hidden;background:#15120E;color:#EDE6DA;font-family:Georgia,'Times New Roman',serif}
    .izq{position:absolute;left:96px;top:0;bottom:0;width:620px;display:flex;flex-direction:column;justify-content:center}
    .marca{display:flex;align-items:center;gap:36px}
    .marca svg{width:180px;height:180px;flex:none}
    h1{margin:0;font-size:96px;font-weight:600;line-height:1}
    .para{margin:12px 0 0;font:28px/1.3 system-ui,'Segoe UI',sans-serif;color:#A39887}
    .lema{margin:56px 0 0;font:32px/1.4 system-ui,'Segoe UI',sans-serif;color:#F0BC5E}
    .der{position:absolute;right:96px;top:50%;transform:translateY(-50%);width:520px}
    .paso{display:flex;gap:22px;align-items:flex-start;margin:0 0 20px;padding:24px 28px;background:#1D1914;border:2px solid rgba(240,188,94,.28);border-radius:18px}
    .paso:last-child{margin:0}
    .n{flex:none;width:44px;height:44px;border-radius:50%;background:#F0BC5E;color:#15120E;font:600 24px/44px system-ui,'Segoe UI',sans-serif;text-align:center}
    .paso b{display:block;font:600 26px/1.3 system-ui,'Segoe UI',sans-serif}
    .paso span{display:block;margin-top:4px;font:20px/1.4 system-ui,'Segoe UI',sans-serif;color:#A39887}
  </style>
  <div class="izq"><div class="marca">${svg}<div><h1>Ranvier</h1><p class="para">para Mielina</p></div></div>
    <p class="lema">La referencia de la página que lees,<br>a tu biblioteca.</p></div>
  <div class="der">
    <div class="paso"><div class="n">1</div><div><b>Haz clic en Ranvier</b><span>en el artículo, el libro o la tesis que lees.</span></div></div>
    <div class="paso"><div class="n">2</div><div><b>Revisa la referencia</b><span>Mielina te muestra qué va a entrar.</span></div></div>
    <div class="paso"><div class="n">3</div><div><b>Guárdala en tu biblioteca</b><span>lista para citarla en APA 7.</span></div></div>
  </div>`);
  await pagina.screenshot({ path: path.join(RAIZ, 'tienda', 'marquesina-1400x560.png') });
} finally {
  await navegador.close();
}
console.log('Íconos listos en src/iconos/ y tienda/');
