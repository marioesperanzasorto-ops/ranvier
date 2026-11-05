/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * El contrato con Mielina, versión 1 (`docs/contrato-del-recolector.md`): los tres mensajes y sus límites. Ranvier y
 * Mielina son programas aparte: solo se pasan estos mensajes, con `window.postMessage` en la pestaña de Mielina, y las
 * referencias en CSL-JSON.
 *
 * Script clásico que deja `RanvierContrato` en `globalThis`: lo usa el puente en la página de Mielina
 * (`contenido/puenteMielina.js`), y el fondo y las pruebas lo importan como módulo.
 */
(() => {
  const VERSION = 1;
  /** Las referencias de un mensaje, como mucho. */
  const MAX_REFERENCIAS = 200;
  /** El tamaño de un mensaje, como mucho (en caracteres de JSON). */
  const MAX_CARACTERES = 5 * 1024 * 1024;
  /** La ruta de la biblioteca en Mielina, donde espera las referencias. */
  const RUTA_DE_LA_BIBLIOTECA = '/biblioteca';

  const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const esCuenta = (v) => Number.isInteger(v) && v >= 0;

  /** Una dirección http o https (sin lo que va después de #); si no, undefined. */
  function paginaValida(valor) {
    if (typeof valor !== 'string' || valor.length > 2048) return undefined;
    try {
      const url = new URL(valor);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
      url.hash = '';
      return url.href;
    } catch {
      return undefined;
    }
  }

  /** Si la página avisa que está lista: `{ tipo: 'mielina/lista', version: 1 }`. */
  function esLista(datos) {
    return esObjeto(datos) && datos.tipo === 'mielina/lista' && datos.version === VERSION;
  }

  /**
   * Lo que respondió Mielina (`mielina/recibidas`), o null si el mensaje es otro.
   * @returns {{ cancelado: true } | { guardadas: number, yaEstaban: number, omitidas: number } | null}
   */
  function leerRecibidas(datos) {
    if (!esObjeto(datos) || datos.tipo !== 'mielina/recibidas' || datos.version !== VERSION) return null;
    if (datos.cancelado === true) return { cancelado: true };
    if (!esCuenta(datos.guardadas) || !esCuenta(datos.yaEstaban) || !esCuenta(datos.omitidas)) return null;
    return { guardadas: datos.guardadas, yaEstaban: datos.yaEstaban, omitidas: datos.omitidas };
  }

  /** El mensaje con las referencias: `{ tipo: 'mielina/referencias', version: 1, formato: 'csl-json', … }`. */
  function mensajeDeReferencias(referencias, pagina) {
    const mensaje = { tipo: 'mielina/referencias', version: VERSION, formato: 'csl-json' };
    const valida = paginaValida(pagina);
    if (valida) mensaje.pagina = valida;
    mensaje.referencias = referencias;
    return mensaje;
  }

  /**
   * Si un envío cabe en el contrato. Si no, el motivo: 'ninguna', 'demasiadas' (más de `MAX_REFERENCIAS`) o
   * 'muyGrande' (más de `MAX_CARACTERES`).
   * @returns {{ ok: true } | { ok: false, motivo: string }}
   */
  function revisarEnvio(referencias, pagina) {
    if (!Array.isArray(referencias) || referencias.length === 0) return { ok: false, motivo: 'ninguna' };
    if (referencias.length > MAX_REFERENCIAS) return { ok: false, motivo: 'demasiadas' };
    if (!referencias.every(esObjeto)) return { ok: false, motivo: 'ninguna' };
    if (JSON.stringify(mensajeDeReferencias(referencias, pagina)).length > MAX_CARACTERES) return { ok: false, motivo: 'muyGrande' };
    return { ok: true };
  }

  globalThis.RanvierContrato = Object.freeze({
    VERSION,
    MAX_REFERENCIAS,
    MAX_CARACTERES,
    RUTA_DE_LA_BIBLIOTECA,
    paginaValida,
    esLista,
    leerRecibidas,
    mensajeDeReferencias,
    revisarEnvio,
  });
})();
