/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * Las peticiones HTTP de los traductores. Primero se hacen desde la página que se lee (`contenido/leerPagina.js`): a su
 * mismo sitio, con la sesión del estudiante, y a otros sitios si estos lo permiten (CORS). Si otro sitio no lo
 * permite, se hacen desde la extensión, pero solo si el estudiante dio el permiso de sitios (opcional, se pide una
 * sola vez). Si no lo dio, la operación lo anota para pedírselo (`faltaPermiso`).
 *
 * Ranvier nunca habla con Zotero: los traductores vienen en el paquete.
 */

import '../comun/pedir.js';

/** Si una dirección es de Zotero (zotero.org o un subdominio): Ranvier no se conecta con Zotero. */
export function esDeZotero(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'zotero.org' || hostname.endsWith('.zotero.org');
  } catch {
    return false;
  }
}

function mismoOrigen(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Hace la petición de un traductor.
 * @param {object} peticion La de `traductor/entorno.js`.
 * @param {{ pestanaId: number, urlDelDocumento: string, faltaPermiso?: string }} operacion
 */
export async function pedirParaTraductor(peticion, operacion) {
  let url;
  try {
    url = new URL(String(peticion?.url));
  } catch {
    return { fallo: 'Dirección no válida' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { fallo: `No se piden direcciones ${url.protocol}` };
  if (esDeZotero(url.href)) return { fallo: 'Ranvier no se conecta con Zotero' };

  // 1. Desde la página
  let respuesta;
  try {
    respuesta = await chrome.tabs.sendMessage(operacion.pestanaId, { tipo: 'ranvier/pedir', peticion }, { frameId: 0 });
  } catch (e) {
    respuesta = { fallo: String(e?.message || e), sinPagina: true };
  }
  if (!respuesta) respuesta = { fallo: 'La página no respondió', sinPagina: true };
  if (!respuesta.fallo || respuesta.tiempoAgotado) return respuesta;
  if (mismoOrigen(url.href, operacion.urlDelDocumento) && !respuesta.sinPagina) return respuesta;

  // 2. Desde la extensión, con el permiso de sitios
  if (await chrome.permissions.contains({ origins: [`${url.origin}/*`] })) {
    return globalThis.RanvierPedir.pedir(peticion, { credenciales: 'include' });
  }
  operacion.faltaPermiso ??= url.hostname;
  return { fallo: respuesta.fallo };
}
