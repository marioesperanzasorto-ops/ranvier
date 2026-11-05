/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 *
 * La idea (un documento fuera de pantalla con marcos aislados, porque el service worker no tiene DOM) es la de
 * `src/browserExt/background/offscreenManager.js` de zotero/zotero-connectors (AGPL); este código es propio.
 */

import '../comun/canal.js';

const URL_DEL_DOCUMENTO = 'fueraDePantalla/fueraDePantalla.html';
let creando = null;

/** Abre el documento fuera de pantalla, si no está abierto. */
export async function asegurarFueraDePantalla() {
  const abiertos = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(URL_DEL_DOCUMENTO)],
  });
  if (abiertos.length) return;
  creando ??= chrome.offscreen.createDocument({
    url: URL_DEL_DOCUMENTO,
    reasons: ['DOM_PARSER'],
    justification: 'Leer la página con los traductores, en un marco aislado, cuando el estudiante hace clic en Ranvier.',
  }).finally(() => {
    creando = null;
  });
  await creando;
}

/** Le pide algo al documento fuera de pantalla (`detectar`, `traducir` o `cancelar`) y devuelve su resultado. */
export async function pedirAFueraDePantalla(tipo, datos) {
  await asegurarFueraDePantalla();
  for (let intento = 0; ; intento++) {
    let respuesta;
    try {
      respuesta = await chrome.runtime.sendMessage({ destino: 'fueraDePantalla', tipo, ...datos });
    } catch (e) {
      // Recién abierto, puede que todavía no escuche
      if (intento < 5 && /Receiving end does not exist/i.test(String(e?.message))) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      throw e;
    }
    if (!respuesta) throw new Error('El documento fuera de pantalla no respondió');
    if (respuesta.error) throw globalThis.RanvierCanal.errorDesdeDatos(respuesta.error);
    return respuesta.resultado;
  }
}
