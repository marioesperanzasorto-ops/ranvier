/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * Los elementos que dan los traductores de Zotero, en CSL-JSON (el formato público de Citation Style Language, que es
 * el que recibe Mielina: `docs/contrato-del-recolector.md`). La conversión es la de Zotero
 * (`Zotero.Utilities.Item.itemToCSLJSON`); aquí solo se dejan fuera las notas y los adjuntos, y lo vacío.
 *
 * Corre en el marco aislado, después de traducir. Es un script clásico que deja `RanvierCsl` en `globalThis`; las
 * pruebas lo importan como módulo, con el mismo entorno de Zotero.
 */
(() => {
  /** Lo que un traductor puede dar y no es una referencia. */
  const NO_SON_REFERENCIAS = new Set(['note', 'attachment', 'annotation']);

  /** Sin lo vacío: `undefined`, `null`, textos en blanco, listas vacías y fechas sin nada. */
  function sinVacios(objeto) {
    const limpio = {};
    for (const [clave, valor] of Object.entries(objeto)) {
      if (valor === undefined || valor === null) continue;
      if (typeof valor === 'string' && !valor.trim()) continue;
      if (Array.isArray(valor) && valor.length === 0) continue;
      if (typeof valor === 'object' && !Array.isArray(valor) && !valor['date-parts'] && valor.literal !== undefined
        && !String(valor.literal).trim()) continue;
      limpio[clave] = valor;
    }
    return limpio;
  }

  /**
   * La fecha de consulta: algunos traductores ponen 'CURRENT_TIMESTAMP', que la aplicación de Zotero cambia por la
   * hora al guardar. Aquí se cambia por la hora de la lectura (en ISO 8601, como la pone Zotero).
   */
  function conFechaDeConsulta(elemento, ahora) {
    if (elemento.accessDate !== 'CURRENT_TIMESTAMP') return elemento;
    return { ...elemento, accessDate: Zotero.Date.dateToISO(ahora) };
  }

  /**
   * Un elemento de Zotero en CSL-JSON, o null si no es una referencia (una nota, un adjunto).
   * @param {object} elemento Como lo da un traductor: `{ itemType, title, creators, date, … }`.
   * @param {Date} [ahora] La hora de la lectura.
   */
  function elementoACslJson(elemento, ahora = new Date()) {
    if (!elemento || typeof elemento !== 'object' || NO_SON_REFERENCIAS.has(elemento.itemType)) return null;
    if (!Zotero.Schema.CSL_TYPE_MAPPINGS[elemento.itemType]) return null;
    const csl = Zotero.Utilities.Item.itemToCSLJSON(conFechaDeConsulta(elemento, ahora));
    // `id` es la dirección del elemento en una biblioteca de Zotero: aquí no la hay
    delete csl.id;
    return sinVacios(csl);
  }

  /** Los elementos de una traducción, en CSL-JSON: solo las referencias, en el mismo orden. */
  function aCslJson(elementos, ahora = new Date()) {
    const referencias = [];
    for (const elemento of elementos || []) {
      try {
        const csl = elementoACslJson(elemento, ahora);
        if (csl) referencias.push(csl);
      } catch (e) {
        Zotero.debug(`Ranvier: un elemento no se pudo pasar a CSL-JSON: ${e}`);
      }
    }
    return referencias;
  }

  globalThis.RanvierCsl = Object.freeze({ aCslJson, elementoACslJson });
})();
