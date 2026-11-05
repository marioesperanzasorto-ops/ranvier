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
 * MODIFICADO para Ranvier (Mielina) por Mario Esperanza, el 04-11-2026. Se basa en `src/browserExt/offscreen/
 * offscreen.js` y `src/browserExt/translateHost/translateHostFrameManager.js` de zotero/zotero-connectors
 * (commit e942336).
 * Cambios: mensajes de `chrome.runtime` con el fondo en vez de `Zotero.MessagingGeneric`; un canal propio con cada
 * marco (`comun/canal.js`); los traductores y su código salen del paquete (`traductores/`), nunca de repo.zotero.org;
 * sin preferencias de Zotero, sin el probador de traductores; nombres en español.
 */

/**
 * El documento fuera de pantalla (offscreen). El fondo de la extensión es un service worker y no tiene DOM; aquí se
 * crea, para cada operación, un marco aislado y desechable (`traductor/traductor.html`) donde corren los traductores.
 * Este documento les da el código de los traductores y pasa al fondo lo que piden: las peticiones HTTP y, si la página
 * es una lista, qué referencias quiere el estudiante.
 */
(() => {
  /** Lo que tarda, como mucho, la detección. */
  const TIEMPO_DE_DETECCION = 30e3;
  /** Lo que tarda, como mucho, un marco en contestar al abrirse. */
  const TIEMPO_DEL_MARCO = 15e3;
  const ID_DE_TRADUCTOR = /^[\w-]{1,64}$/;

  /** Los marcos de cada operación: id → Set de marcos. */
  const operaciones = new Map();
  let indice = null;
  let latido = null;

  /** Los datos de todos los traductores del paquete (sin su código). */
  function metadatos() {
    indice ??= fetch(chrome.runtime.getURL('traductores/indice.json'))
      .then((r) => r.json())
      .then((datos) => datos.traductores)
      .catch((e) => {
        indice = null;
        throw e;
      });
    return indice;
  }

  async function codigo(id) {
    if (typeof id !== 'string' || !ID_DE_TRADUCTOR.test(id)) throw new Error('Ese traductor no existe');
    const todos = await metadatos();
    if (!todos.some((t) => t.translatorID === id)) throw new Error('Ese traductor no existe');
    const respuesta = await fetch(chrome.runtime.getURL(`traductores/${id}.js`));
    if (!respuesta.ok) throw new Error(`No se pudo leer el traductor ${id}`);
    return respuesta.text();
  }

  /** Un mensaje al fondo; devuelve lo que responde. */
  async function alFondo(mensaje) {
    const respuesta = await chrome.runtime.sendMessage({ destino: 'fondo', ...mensaje });
    if (!respuesta) throw new Error('El fondo de la extensión no respondió');
    if (respuesta.error) throw RanvierCanal.errorDesdeDatos(respuesta.error);
    return respuesta.resultado;
  }

  /** Lo que cada marco puede pedir: la detección no tiene HTTP. */
  function funcionesDelMarco(papel, operacion) {
    const funciones = {
      'traductores.metadatos': metadatos,
      'traductores.codigo': codigo,
    };
    if (papel === 'traducir') {
      funciones.http = (peticion) => alFondo({ tipo: 'http', operacion, peticion });
      funciones.elegir = (opciones) => alFondo({ tipo: 'elegir', operacion, opciones });
    }
    return funciones;
  }

  function conLimite(promesa, ms, mensaje) {
    let reloj;
    return Promise.race([
      promesa,
      new Promise((_, rechazar) => {
        reloj = setTimeout(() => rechazar(new Error(mensaje)), ms);
      }),
    ]).finally(() => clearTimeout(reloj));
  }

  /** Abre un marco aislado para una operación y le conecta un canal. */
  async function abrirMarco(papel, operacion) {
    const clave = crypto.randomUUID();
    const marco = document.createElement('iframe');
    marco.hidden = true;
    marco.setAttribute('sandbox', 'allow-scripts');
    marco.src = chrome.runtime.getURL(`traductor/traductor.html?papel=${papel}#${clave}`);
    const registro = { marco, canal: null };
    const marcos = operaciones.get(operacion) || new Set();
    marcos.add(registro);
    operaciones.set(operacion, marcos);
    registro.cerrar = () => {
      registro.canal?.cerrar('La operación terminó');
      marco.remove();
      marcos.delete(registro);
      if (!marcos.size) operaciones.delete(operacion);
      actualizarLatido();
    };
    actualizarLatido();
    try {
      await conLimite(new Promise((resolver, rechazar) => {
        marco.onload = resolver;
        marco.onerror = () => rechazar(new Error('El traductor no se pudo abrir'));
        document.body.append(marco);
      }), TIEMPO_DEL_MARCO, 'El traductor no se abrió');
      const { port1, port2 } = new MessageChannel();
      await conLimite(new Promise((resolver, rechazar) => {
        port1.onmessage = (evento) => {
          if (evento.data?.tipo === 'ranvier/listo' && evento.data.clave === clave) resolver();
          else rechazar(new Error('El traductor no respondió como debía'));
        };
        marco.contentWindow.postMessage('ranvier/canal', '*', [port2]);
      }), TIEMPO_DEL_MARCO, 'El traductor no respondió');
      registro.canal = new RanvierCanal.Canal(port1, funcionesDelMarco(papel, operacion));
      // Si el marco se recarga o navega, ya no es el mismo: se cierra
      marco.onload = () => registro.cerrar();
      return registro;
    } catch (e) {
      registro.cerrar();
      throw e;
    }
  }

  /** Mientras haya operaciones, el fondo no debe dormirse: se le avisa cada 20 segundos. */
  function actualizarLatido() {
    if (operaciones.size && !latido) {
      latido = setInterval(() => alFondo({ tipo: 'latido' }).catch(() => {}), 20e3);
    } else if (!operaciones.size && latido) {
      clearInterval(latido);
      latido = null;
    }
  }

  async function detectar({ operacion, documento }) {
    const registro = await abrirMarco('detectar', operacion);
    try {
      await registro.canal.llamar('iniciar', { documento });
      return await conLimite(registro.canal.llamar('detectar'), TIEMPO_DE_DETECCION, 'La detección tardó demasiado');
    } finally {
      registro.cerrar();
    }
  }

  async function traducir({ operacion, documento, traductores }) {
    const registro = await abrirMarco('traducir', operacion);
    try {
      await registro.canal.llamar('iniciar', { documento });
      return await registro.canal.llamar('traducir', { traductores });
    } finally {
      registro.cerrar();
    }
  }

  function cancelar({ operacion }) {
    for (const registro of [...(operaciones.get(operacion) || [])]) registro.cerrar();
    return true;
  }

  const ACCIONES = { detectar, traducir, cancelar };

  chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
    if (remitente.id !== chrome.runtime.id || mensaje?.destino !== 'fueraDePantalla') return false;
    const accion = Object.hasOwn(ACCIONES, mensaje.tipo) ? ACCIONES[mensaje.tipo] : null;
    if (!accion) return false;
    Promise.resolve()
      .then(() => accion(mensaje))
      .then(
        (resultado) => responder({ resultado }),
        (e) => responder({ error: RanvierCanal.serializarError(e) }),
      );
    return true;
  });
})();
