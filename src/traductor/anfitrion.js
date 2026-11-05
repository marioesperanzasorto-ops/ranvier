/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2021 Center for History and New Media
					George Mason University, Fairfax, Virginia, USA
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
 * MODIFICADO para Ranvier (Mielina) por Mario Esperanza, el 04-11-2026. Se basa en
 * `src/browserExt/translateHost/translateHost.js` de zotero/zotero-connectors (commit e942336).
 * Cambios: un canal propio (`comun/canal.js`) en vez de `Zotero.MessagingGeneric`; el papel se lee de la dirección y
 * el entorno de Zotero se arma una vez al cargar; sin cookies de la página ni observadores del DOM; al terminar, los
 * elementos se pasan a CSL-JSON (`comun/cslJson.js`); sin el probador de traductores; nombres en español.
 */

/**
 * El anfitrión de una sola operación (detectar o traducir) en un marco aislado y desechable. Los traductores corren
 * aquí, con `eval`, sin acceso a la extensión: su CSP no deja salir a la red, y lo único que tienen es el canal con el
 * documento fuera de pantalla. La detección no puede hacer peticiones HTTP.
 */
(() => {
  const papel = new URLSearchParams(window.location.search).get('papel') === 'traducir' ? 'traducir' : 'detectar';
  RanvierEntorno.papel = papel;

  // El entorno de Zotero, con los datos que vienen en el paquete
  Zotero.Schema.init(globalThis.RANVIER_ESQUEMA_DE_ZOTERO);
  Zotero.Date.init(globalThis.RANVIER_FORMATOS_DE_FECHA);
  Zotero.Debug.init(false);

  if (papel === 'detectar') {
    // Las funciones de HTTP fallan al instante: un traductor no puede pedir nada mientras se detecta
    const noDisponible = () => {
      throw new Error('HTTP requests are unavailable during translator detection');
    };
    for (const metodo of ['request', 'doGet', 'doPost', 'processDocuments']) {
      if (Zotero.HTTP[metodo]) Zotero.HTTP[metodo] = noDisponible;
    }
    Zotero.COHTTP.request = noDisponible;
    for (const metodo of ['processDocuments', 'request', 'requestText', 'requestJSON', 'requestDocument', 'doGet', 'doPost']) {
      if (Zotero.Utilities.Translate.prototype[metodo]) Zotero.Utilities.Translate.prototype[metodo] = noDisponible;
    }
  }

  /** Lo que se pasa de un traductor al otro lado: sus datos, sin el código. */
  function traductorSerializado(traductor) {
    return {
      translatorID: traductor.translatorID,
      label: traductor.label,
      itemType: traductor.itemType,
      priority: traductor.priority,
      proxy: traductor.proxy?.toJSON ? traductor.proxy.toJSON() : traductor.proxy || null,
    };
  }

  async function traductoresDesdeDatos(datos) {
    const traductores = [];
    for (const dato of datos || []) {
      const traductor = await Zotero.Translators.get(dato.translatorID);
      if (!traductor) throw new Error(`No está el traductor ${dato.translatorID}`);
      if (dato.proxy) traductor.proxy = new Zotero.Proxy(dato.proxy);
      traductores.push(traductor);
    }
    return traductores;
  }

  /** Un observador del DOM que no observa nada: el documento es una copia, no cambia. */
  class ObservadorInerte {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  /**
   * Arma el documento de la página con su HTML, sin acceso a lo que la página tiene en el navegador.
   * @param {{ html: string, url: string }} documento
   */
  function crearDocumento({ html, url }) {
    // <video> y <audio> pierden memoria en DOMParser (https://issues.chromium.org/issues/254330164)
    html = html.replace(/<(video|audio)(?:\s[^>]*)?(?:\/>|>.*?<\/\1>)/gis, '');
    // En el navegador, <noscript> es texto; en DOMParser sería HTML y podría cerrar antes el <head>
    html = html.replace(/<noscript(?:\s[^>]*)?(?:\/>|>.*?<\/noscript>)/gis, '');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    let base = doc.querySelector('base[href]');
    let urlBase = url;
    if (base) {
      urlBase = new URL(base.getAttribute('href'), url).href;
    } else {
      base = doc.createElement('base');
    }
    base.setAttribute('href', urlBase);
    doc.head.appendChild(base);
    return Zotero.HTTP.wrapDocument(doc, url, {
      defaultView: { MutationObserver: ObservadorInerte },
      cookie: '',
    });
  }

  let documento = null;

  const funciones = {
    /** Recibe la página (su HTML y su dirección). */
    iniciar(datos) {
      RanvierEntorno.urlDelDocumento = datos.documento.url;
      documento = crearDocumento(datos.documento);
      return true;
    },

    /** Los traductores que sirven para la página, del más al menos indicado. */
    async detectar() {
      const traductores = await Zotero.TranslateWeb.detect({ document: documento });
      return traductores.map(traductorSerializado);
    },

    /**
     * Traduce la página con los traductores dados (si uno falla, prueba el siguiente) y devuelve las referencias en
     * CSL-JSON. Si la página es una lista, pregunta cuáles por el canal (`elegir`).
     */
    async traducir({ traductores }) {
      const resultado = await Zotero.TranslateWeb.translate({
        document: documento,
        translators: await traductoresDesdeDatos(traductores),
        onSelect: (obj, opciones, responder) => {
          RanvierEntorno.llamar('elegir', opciones).then(responder, () => responder({}));
        },
        onTranslatorFallback: (anterior, siguiente) => {
          Zotero.debug(`Ranvier: ${anterior.label} falló; se prueba ${siguiente.label}`);
        },
      });
      return { referencias: RanvierCsl.aCslJson(resultado.items || []) };
    },
  };

  window.addEventListener('message', (evento) => {
    if (evento.source !== window.parent || evento.data !== 'ranvier/canal' || evento.ports.length !== 1) return;
    if (RanvierEntorno.canal) return;
    const puerto = evento.ports[0];
    RanvierEntorno.canal = new RanvierCanal.Canal(puerto, funciones);
    // La clave de la dirección le confirma al otro lado que habla con este marco
    puerto.postMessage({ tipo: 'ranvier/listo', clave: decodeURIComponent(window.location.hash.slice(1)) });
  });
})();
