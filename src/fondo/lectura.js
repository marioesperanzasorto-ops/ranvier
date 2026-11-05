/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * Leer una página: se pone `contenido/leerPagina.js` en la pestaña (solo después del clic: `activeTab`), se detectan
 * los traductores que le sirven y se traduce en el documento fuera de pantalla. El resultado son las referencias en
 * CSL-JSON. La ventana del botón (`ventana/`) sigue cada paso y, si la página es una lista, el estudiante elige ahí.
 */

import '../comun/contrato.js';
import { pedirAFueraDePantalla } from './fueraDePantalla.js';

/** Las operaciones en curso: id → `{ pestanaId, urlDelDocumento, faltaPermiso, elegir, cancelada }`. */
export const operaciones = new Map();

/** Un error que la ventana sabe explicar: `codigo` es 'noSePuedeLeer', 'sinReferencias', 'ningunaElegida'… */
export class ErrorDeRanvier extends Error {
  constructor(codigo, datos = {}) {
    super(codigo);
    this.codigo = codigo;
    Object.assign(this, datos);
  }
}

/** La página de la pestaña: su HTML y su dirección. */
async function leerLaPagina(pestanaId) {
  let resultados;
  try {
    resultados = await chrome.scripting.executeScript({
      target: { tabId: pestanaId },
      files: ['comun/pedir.js', 'contenido/leerPagina.js'],
    });
  } catch {
    // Una página del navegador, de la tienda de extensiones o un archivo local
    throw new ErrorDeRanvier('noSePuedeLeer');
  }
  const pagina = resultados?.[0]?.result;
  if (!pagina || pagina.error === 'vacia') throw new ErrorDeRanvier('noSePuedeLeer');
  if (pagina.error === 'muyGrande') throw new ErrorDeRanvier('paginaMuyGrande');
  if (!/^https?:/i.test(pagina.url)) throw new ErrorDeRanvier('noSePuedeLeer');
  return { html: pagina.html, url: pagina.url };
}

/**
 * Lee la pestaña y devuelve sus referencias.
 * @param {number} pestanaId
 * @param {{ avisar: (estado: string) => void, elegir: (opciones: object[]) => Promise<string[]|null>,
 *   alCancelar: (fn: () => void) => void }} ventana
 * @returns {Promise<{ referencias: object[], pagina: string }>}
 */
export async function leerPestana(pestanaId, ventana) {
  const id = crypto.randomUUID();
  const operacion = { id, pestanaId, urlDelDocumento: null, faltaPermiso: null, cancelada: false, nadaElegido: false };
  operacion.elegir = async (opciones) => {
    const lista = Object.entries(opciones || {}).map(([clave, titulo]) => ({ clave, titulo: String(titulo ?? '') }));
    const claves = await ventana.elegir(lista);
    const elegidas = {};
    for (const clave of claves || []) {
      if (Object.hasOwn(opciones, clave)) elegidas[clave] = opciones[clave];
    }
    if (!Object.keys(elegidas).length) operacion.nadaElegido = true;
    return elegidas;
  };
  operaciones.set(id, operacion);
  ventana.alCancelar(() => {
    operacion.cancelada = true;
    pedirAFueraDePantalla('cancelar', { operacion: id }).catch(() => {});
  });

  try {
    ventana.avisar('leyendo');
    const documento = await leerLaPagina(pestanaId);
    operacion.urlDelDocumento = documento.url;

    ventana.avisar('buscando');
    const traductores = await pedirAFueraDePantalla('detectar', { operacion: id, documento });
    if (operacion.cancelada) throw new ErrorDeRanvier('cancelada');
    if (!traductores?.length) throw new ErrorDeRanvier('sinReferencias');

    ventana.avisar('traduciendo');
    let referencias = [];
    let fallo = null;
    try {
      ({ referencias } = await pedirAFueraDePantalla('traducir', { operacion: id, documento, traductores }));
    } catch (e) {
      fallo = e;
    }
    if (operacion.cancelada) throw new ErrorDeRanvier('cancelada');
    if (operacion.faltaPermiso) {
      throw new ErrorDeRanvier('faltaPermiso', { sitio: operacion.faltaPermiso, referencias, pagina: documento.url });
    }
    if (operacion.nadaElegido && !referencias.length) throw new ErrorDeRanvier('ningunaElegida');
    if (fallo && !referencias.length) throw new ErrorDeRanvier('falloAlTraducir', { detalle: String(fallo.message || fallo) });
    if (!referencias.length) throw new ErrorDeRanvier('sinReferencias');
    return { referencias, pagina: documento.url };
  } finally {
    operaciones.delete(id);
  }
}
