/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2011, 2021 Center for History and New Media, George Mason University, Fairfax, Virginia, USA,
	and Corporation for Digital Scholarship, Vienna, Virginia, USA. http://zotero.org
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
 * MODIFICADO para Ranvier (Mielina) por Mario Esperanza, el 04-11-2026. Se basa en:
 * - `example/translators.js` y `example/translate_item.js` de zotero/translate (commit bea5b9a);
 * - `src/common/http.js` (`wrapDocument`, `determineDOMParserContentType`, la revisión del estado) y
 *   `src/common/inject/http.js` (`processDocuments`) de zotero/zotero-connectors (commit e942336).
 * Cambios: los traductores y su código llegan por el canal del documento fuera de pantalla (vienen dentro del paquete,
 * nunca de repo.zotero.org); las peticiones HTTP también salen por el canal (en la detección no hay); no se guarda nada
 * en Zotero: los elementos solo se juntan; no se reportan errores a Zotero; nombres y comentarios en español.
 */

/**
 * El entorno de Zotero dentro del marco aislado (`traductor.html`): lo que la arquitectura de traducción de Zotero pide
 * que implemente quien la usa (`Zotero.Translators`, `Zotero.HTTP` y `Zotero.Translate.ItemSaver`). El marco no tiene
 * red (su CSP es `default-src 'none'`): todo pasa por `RanvierEntorno.llamar`, que el anfitrión (`anfitrion.js`) conecta
 * con el canal.
 */
globalThis.RanvierEntorno = {
  /** El canal con el documento fuera de pantalla; lo pone `anfitrion.js`. */
  canal: null,
  /** 'detectar' o 'traducir': en la detección no hay peticiones HTTP. */
  papel: null,
  /** La dirección de la página que se traduce, para resolver las direcciones relativas. */
  urlDelDocumento: null,

  llamar(metodo, ...args) {
    if (!this.canal) return Promise.reject(new Error('El traductor todavía no tiene canal'));
    return this.canal.llamar(metodo, ...args);
  },
};

// Nada se reporta a Zotero, no se bajan adjuntos ni capturas, y los títulos quedan como vienen
Zotero.Prefs.set('reportTranslationFailure', false);
Zotero.Prefs.set('downloadAssociatedFiles', false);
Zotero.Prefs.set('automaticSnapshots', false);
Zotero.Prefs.set('capitalizeTitles', false);

/* ------------------------------------------------------------------------------------------------------------------ */
/* Los traductores                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

Zotero.Translators = Object.assign(Zotero.Translators, {
  _cache: { import: [], export: [], web: [], search: [] },
  _porId: new Map(),
  _initialized: false,

  /** Carga los datos de todos los traductores del paquete (sin su código). */
  async init() {
    const metadatos = await RanvierEntorno.llamar('traductores.metadatos');
    this._cache = { import: [], export: [], web: [], search: [] };
    this._porId = new Map();
    for (const info of metadatos) {
      try {
        const traductor = new Zotero.Translator(Object.assign({}, info));
        this._porId.set(traductor.translatorID, traductor);
        for (const tipo in TRANSLATOR_TYPES) {
          if (traductor.translatorType & TRANSLATOR_TYPES[tipo]) this._cache[tipo].push(traductor);
        }
      } catch (e) {
        Zotero.logError(e);
      }
    }
    for (const tipo in this._cache) this._cache[tipo].sort((a, b) => a.priority - b.priority);
    this._initialized = true;
  },

  /** El código de un traductor, del paquete. */
  getCodeForTranslator: Zotero.Promise.method(async function (traductor) {
    if (traductor.code) return traductor.code;
    traductor.code = await RanvierEntorno.llamar('traductores.codigo', traductor.translatorID);
    return traductor.code;
  }),

  /** Un traductor, con su código. */
  async get(id) {
    if (!this._initialized) await this.init();
    const traductor = this._porId.get(id);
    if (!traductor) return false;
    if (!traductor.code) await this.getCodeForTranslator(traductor);
    return traductor;
  },

  /** Todos los traductores de un tipo, con su código. */
  async getAllForType(tipo) {
    if (!this._initialized) await this.init();
    const traductores = this._cache[tipo].slice(0);
    await new Zotero.Translators.CodeGetter(traductores).getAll();
    return traductores;
  },
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* HTTP                                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

Zotero.HTTP.VALID_DOM_PARSER_CONTENT_TYPES = new Set([
  'text/html',
  'text/xml',
  'application/xml',
  'application/xhtml+xml',
  'image/svg+xml',
]);

Zotero.HTTP.StatusError = function (respuesta, url, texto) {
  this.message = `HTTP request to ${url} rejected with status ${respuesta.status}`;
  this.status = respuesta.status;
  try {
    this.responseText = String(texto ?? '').substr(0, 1024);
  } catch (e) {
    // Sin texto
  }
};
Zotero.HTTP.StatusError.prototype = Object.create(Error.prototype);

Zotero.HTTP.TimeoutError = function (url, ms) {
  this.message = `HTTP request to ${url} has timed out after ${ms}ms`;
};
Zotero.HTTP.TimeoutError.prototype = Object.create(Error.prototype);

Zotero.HTTP.determineDOMParserContentType = function (contentType) {
  contentType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (Zotero.HTTP.VALID_DOM_PARSER_CONTENT_TYPES.has(contentType)) return contentType;
  return contentType.includes('xml') ? 'text/xml' : 'text/html';
};

/** Lo que devuelve el canal, con la forma de un `XMLHttpRequest` terminado, que es lo que esperan los traductores. */
function respuestaComoXhr(datos, tipo) {
  const cabeceras = String(datos.cabeceras || '');
  const texto = typeof datos.texto === 'string' ? datos.texto : '';
  let response = texto;
  if (tipo === 'json') {
    try {
      response = JSON.parse(texto);
    } catch (e) {
      Zotero.debug(`HTTP: el JSON de ${datos.url} no se pudo leer`);
    }
  } else if (tipo === 'document') {
    const contentType = (cabeceras.match(/^content-type: (.*)$/im) || [])[1] || 'text/html';
    response = new DOMParser().parseFromString(texto, Zotero.HTTP.determineDOMParserContentType(contentType));
  } else if (tipo === 'arraybuffer' || tipo === 'blob') {
    const binario = atob(datos.base64 || '');
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    response = tipo === 'blob' ? new Blob([bytes]) : bytes.buffer;
  }
  return {
    status: datos.status,
    statusText: datos.statusText || '',
    responseURL: datos.url,
    responseType: tipo,
    response,
    responseText: texto,
    getAllResponseHeaders: () => cabeceras,
    getResponseHeader(nombre) {
      const linea = cabeceras.match(new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (.*)$`, 'mi'));
      return linea ? linea[1].trim() : null;
    },
  };
}

/**
 * Una petición HTTP de un traductor. Sale por el canal: el documento fuera de pantalla la pasa al fondo de la
 * extensión, que la hace desde la página (su mismo sitio) o, si el estudiante dio el permiso, desde la extensión.
 */
Zotero.HTTP.request = async function (method, url, options = {}) {
  if (RanvierEntorno.papel !== 'traducir') {
    throw new Error('HTTP requests are unavailable during translator detection');
  }
  options = Object.assign({
    body: null,
    headers: {},
    timeout: 15000,
    responseType: '',
    responseCharset: null,
    successCodes: null,
  }, options);
  method = String(method || 'GET').toUpperCase();
  const direccion = new URL(String(url), RanvierEntorno.urlDelDocumento || undefined).href;

  let cuerpo = options.body;
  const cabeceras = Object.assign({}, options.headers);
  if (['GET', 'HEAD'].includes(method)) {
    if (cuerpo != null) throw new Error(`HTTP ${method} cannot have a request body (${cuerpo})`);
  } else if (cuerpo != null) {
    if (typeof cuerpo !== 'string') cuerpo = JSON.stringify(cuerpo);
    const tipoDeContenido = Object.keys(cabeceras).find((c) => c.toLowerCase() === 'content-type');
    if (!tipoDeContenido) cabeceras['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  if (options.referrer && !Object.keys(cabeceras).some((c) => c.toLowerCase() === 'referer')) {
    cabeceras.Referer = options.referrer;
  }
  Zotero.debug(`HTTP ${method} ${direccion}`);

  const tipo = options.responseType || 'text';
  const datos = await RanvierEntorno.llamar('http', {
    metodo: method,
    url: direccion,
    cuerpo: cuerpo ?? null,
    cabeceras,
    tiempo: options.timeout,
    juegoDeCaracteres: options.responseCharset || null,
    binario: tipo === 'arraybuffer' || tipo === 'blob',
  });
  if (datos.tiempoAgotado) throw new Zotero.HTTP.TimeoutError(direccion, options.timeout);
  if (datos.fallo) {
    // La red falló (o el sitio no deja leer su respuesta): como el estado 0 de un XMLHttpRequest
    if (options.successCodes === false) return respuestaComoXhr({ status: 0, url: direccion, texto: datos.fallo }, tipo);
    throw new Zotero.HTTP.StatusError({ status: 0 }, direccion, datos.fallo);
  }

  const respuesta = respuestaComoXhr(datos, tipo);
  // null o undefined: lo normal (2xx); false: todo vale
  const estadoInvalido = options.successCodes == null && (respuesta.status < 200 || respuesta.status >= 300);
  const codigoInvalido = Array.isArray(options.successCodes) && !options.successCodes.includes(respuesta.status);
  if (estadoInvalido || codigoInvalido) {
    throw new Zotero.HTTP.StatusError(respuesta, direccion, respuesta.responseText);
  }
  return respuesta;
};

// Las peticiones a otro sitio también salen por el canal
Zotero.COHTTP = { request: (...args) => Zotero.HTTP.request(...args) };

/**
 * Un documento con `location`, como uno cargado en el navegador, para los traductores.
 * @param {Document} doc
 * @param {string} docURL
 * @param {object} [props] Otras propiedades que debe tener (`defaultView`, `cookie`).
 */
Zotero.HTTP.wrapDocument = function (doc, docURL, props = {}) {
  const location = new URL(docURL);
  const wrappedDoc = new Proxy(doc, {
    get(t, prop) {
      if (prop === 'location') return location;
      if (prop === 'evaluate') {
        // Si se pasa el mismo documento como segundo argumento, falla: recibiría el Proxy, que no es un `Node`
        return function (...args) {
          if (args[1] === wrappedDoc) args[1] = t;
          return t.evaluate(...args);
        };
      }
      if (prop === 'documentURI' || prop === 'URL') return location.href;
      if (Object.hasOwn(props, prop)) return props[prop];
      const valor = t[prop];
      return typeof valor === 'function' ? valor.bind(t) : valor;
    },
  });
  return wrappedDoc;
};

/** Carga uno o más documentos y le pasa cada uno a `processor`, en orden. */
Zotero.HTTP.processDocuments = async function (urls, processor) {
  if (typeof urls === 'string') urls = [urls];
  const resultados = [];
  for (const url of urls) {
    const xhr = await Zotero.HTTP.request('GET', url, { responseType: 'text' });
    const contentType = xhr.getResponseHeader('Content-Type');
    const doc = new DOMParser().parseFromString(xhr.responseText, Zotero.HTTP.determineDOMParserContentType(contentType));
    resultados.push(await processor(Zotero.HTTP.wrapDocument(doc, xhr.responseURL || url), url));
  }
  return resultados;
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Los elementos traducidos: solo se juntan                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

Zotero.Translate.ItemSaver.prototype.saveItems = async function (jsonItems) {
  this.items = (this.items || []).concat(jsonItems);
  return jsonItems;
};
