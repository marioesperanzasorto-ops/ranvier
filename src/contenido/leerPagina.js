/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2024 Corporation for Digital Scholarship
					Vienna, Virginia, USA
					http://zotero.org
	Copyright © 2026 Mario Esperanza (las modificaciones para Ranvier).

	This file is part of Ranvier, and it is derived from Zotero.

	Ranvier is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	Ranvier is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Ranvier.  If not, see <http://www.gnu.org/licenses/>.

	***** END LICENSE BLOCK *****
*/

/*
 * MODIFICADO para Ranvier (Mielina) por Mario Esperanza, el 04-11-2026. Se basa en `serializeDocument` de
 * `src/browserExt/inject/remoteTranslate.js` de zotero/zotero-connectors (commit e942336).
 * Cambios: no lleva las cookies de la página ni toca sus casillas; tiene un límite de tamaño; además responde las
 * peticiones HTTP de los traductores a su mismo sitio (con `comun/pedir.js`); nombres en español.
 */

/**
 * Se pone en la página solo cuando el estudiante hace clic en Ranvier (`activeTab` y `scripting`): antes no se lee
 * nada. Devuelve la página (su HTML y su dirección) para que los traductores la lean en el marco aislado, y se queda
 * para hacer, desde la página, las peticiones de los traductores: así llevan la sesión del estudiante en ese sitio,
 * como si él abriera el enlace.
 */
(() => {
  /** Lo más grande que se manda de una página. */
  const MAX_CARACTERES = 30 * 1024 * 1024;

  if (!globalThis.__ranvierPaginaLista) {
    globalThis.__ranvierPaginaLista = true;
    chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
      if (remitente.id !== chrome.runtime.id || mensaje?.tipo !== 'ranvier/pedir') return false;
      RanvierPedir.pedir(mensaje.peticion, { credenciales: 'same-origin' })
        .then(responder, (e) => responder({ fallo: String(e?.message || e) }));
      return true;
    });
  }

  // Los elementos del <head> que sirven para traducir. <noscript> se quita en el marco aislado
  const ELEMENTOS_DEL_HEAD = new Set(['base', 'link', 'meta', 'title', 'style', 'script', 'template']);

  function sobraEnElHead(nodo) {
    return (nodo.nodeType === Node.ELEMENT_NODE && !ELEMENTOS_DEL_HEAD.has(nodo.localName))
      || (nodo.nodeType === Node.TEXT_NODE && nodo.nodeValue.trim() !== '');
  }

  function serializar() {
    const raiz = document.documentElement;
    if (!raiz) return { error: 'vacia' };
    let html = raiz.outerHTML;
    const head = document.head;
    if (head && document.body && [...head.childNodes].some(sobraEnElHead)) {
      // Un <head> con otros elementos haría que DOMParser lo cierre antes: se manda uno limpio
      const copia = head.cloneNode(true);
      for (const nodo of [...copia.childNodes]) {
        if (sobraEnElHead(nodo)) nodo.remove();
      }
      const htmlDeLaRaiz = raiz.cloneNode(false).outerHTML;
      const cierre = `</${raiz.localName}>`;
      html = htmlDeLaRaiz.slice(0, -cierre.length) + copia.outerHTML + document.body.outerHTML + cierre;
    }
    if (html.length > MAX_CARACTERES) return { error: 'muyGrande' };
    return { html, url: document.location.href, tipoDeContenido: document.contentType };
  }

  return serializar();
})();
