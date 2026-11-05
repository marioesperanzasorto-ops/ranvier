/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * Dónde está Mielina. La compilación de desarrollo (`npm run compilar:desarrollo`) reescribe este archivo con
 * `http://localhost:3000`; la de las tiendas lo deja así.
 */

/** La Mielina que se abre si no hay una pestaña de la biblioteca. */
export const MIELINA = 'https://mielinapp.com';
/** Los orígenes donde se busca una pestaña de la biblioteca (el manifiesto pone el puente en todos). */
export const MIELINAS = ['https://mielinapp.com'];
/** El código fuente de Ranvier. */
export const REPOSITORIO = 'https://github.com/marioesperanzasorto-ops/ranvier';
/** El permiso opcional de sitios, que se pide una sola vez (`optional_host_permissions` del manifiesto). */
export const PERMISO_DE_SITIOS = { origins: ['http://*/*', 'https://*/*'] };
