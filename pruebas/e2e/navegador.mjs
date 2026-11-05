/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Lo que comparten las pruebas de punta a punta: compilar Ranvier para la Mielina falsa, abrir Chrome for Testing
 * (el de Puppeteer) con la extensión sin empaquetar, hacer clic en el botón y leer la ventana.
 */

import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { compilar, RAIZ } from '../../scripts/compilar.mjs';
import { iniciarServidores } from './servidor.mjs';

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Repite `fn` hasta que devuelva algo (o se acabe el tiempo). */
export async function hasta(fn, { tiempo = 15000, cada = 100, que = 'la condición' } = {}) {
  const fin = Date.now() + tiempo;
  let ultimo;
  while (Date.now() < fin) {
    try {
      ultimo = await fn();
      if (ultimo) return ultimo;
    } catch (e) {
      ultimo = e;
    }
    await esperar(cada);
  }
  throw new Error(`Se acabó el tiempo esperando ${que}${ultimo instanceof Error ? `: ${ultimo.message}` : ''}`);
}

export async function prepararEntorno() {
  const servidores = await iniciarServidores();
  const temporal = await mkdtemp(path.join(os.tmpdir(), 'ranvier-'));
  const carpeta = await compilar({ desarrollo: true, mielina: servidores.mielina, salida: path.join(RAIZ, 'dist-pruebas') });
  const navegador = await puppeteer.launch({
    headless: process.env.RANVIER_VER ? false : true,
    pipe: true,
    enableExtensions: [carpeta],
    userDataDir: temporal,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const extension = await hasta(async () => {
    const extensiones = await navegador.extensions();
    return [...extensiones.values()].find((e) => e.path && path.resolve(e.path) === path.resolve(carpeta))
      || [...extensiones.values()].find((e) => e.name?.startsWith('Ranvier'));
  }, { que: 'la extensión' });

  return {
    servidores,
    navegador,
    extension,
    carpeta,
    /** El service worker de la extensión. */
    async fondo() {
      const objetivo = await navegador.waitForTarget(
        (t) => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${extension.id}/`),
      );
      return objetivo.worker();
    },
    /** Hace clic en el botón de Ranvier en la página y devuelve la ventana que se abre. */
    async hacerClic(pagina) {
      const antes = new Set(navegador.targets());
      await pagina.bringToFront();
      await pagina.triggerExtensionAction(extension);
      const objetivo = await navegador.waitForTarget(
        (t) => !antes.has(t) && t.url().endsWith('/ventana/ventana.html'),
        { timeout: 10000 },
      );
      const ventana = await objetivo.asPage();
      return ventana;
    },
    /** La pestaña de la Mielina falsa que esté abierta, si hay. */
    async pestanaDeMielina() {
      for (const pagina of await navegador.pages()) {
        if (pagina.url().startsWith(`${servidores.mielina}/biblioteca`)) return pagina;
      }
      return null;
    },
    async cerrar() {
      await navegador.close().catch(() => {});
      await servidores.cerrar();
      await rm(temporal, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** El texto visible de la ventana: el panel que se ve. */
export async function textoDeLaVentana(ventana) {
  return ventana.evaluate(() => {
    const visible = [...document.querySelectorAll('main > section')].find((s) => !s.hidden);
    return visible ? visible.innerText : '';
  });
}
