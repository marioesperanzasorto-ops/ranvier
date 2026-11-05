/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * La entrega a Mielina (`docs/contrato-del-recolector.md`). Se enfoca una pestaña de la biblioteca que ya esté abierta
 * (con el puente vivo: `contenido/puenteMielina.js`) o se abre una nueva. El envío queda guardado en la sesión del
 * navegador (`chrome.storage.session`, que se borra al cerrarlo) hasta que Mielina responde, para que una pestaña
 * nueva (o una que se recarga) lo pida al cargar. La respuesta se muestra en la insignia del botón.
 */

import '../comun/contrato.js';
import { MIELINA, MIELINAS } from '../comun/config.js';

const CLAVE = 'envioPendiente';
/** Lo que espera un envío a que Mielina lo pida. */
const VIGENCIA = 15 * 60e3;
/** Lo que dura la insignia con la respuesta. */
const DURACION_DE_LA_INSIGNIA = 60e3;

const C = globalThis.RanvierContrato;

/** Las direcciones de la biblioteca de Mielina, como patrones de `chrome.tabs.query` (los mismos del manifiesto). */
export function patronesDeLaBiblioteca(mielinas = MIELINAS) {
  return mielinas.map((origen) => `${origen}${C.RUTA_DE_LA_BIBLIOTECA}*`);
}

async function leerPendiente() {
  const { [CLAVE]: pendiente } = await chrome.storage.session.get(CLAVE);
  if (!pendiente) return null;
  if (Date.now() - pendiente.creado > VIGENCIA) {
    await chrome.storage.session.remove(CLAVE);
    return null;
  }
  return pendiente;
}

const guardarPendiente = (pendiente) => chrome.storage.session.set({ [CLAVE]: pendiente });

async function enfocar(pestana) {
  await chrome.tabs.update(pestana.id, { active: true });
  await chrome.windows.update(pestana.windowId, { focused: true }).catch(() => {});
}

/**
 * Entrega las referencias a Mielina.
 * @param {{ referencias: object[], pagina?: string, pestanaOrigen?: number }} datos
 * @returns {Promise<{ pestana: number, nueva: boolean }>}
 */
export async function entregar({ referencias, pagina, pestanaOrigen }) {
  const revision = C.revisarEnvio(referencias, pagina);
  if (!revision.ok) {
    const error = new Error('El envío no cabe en el contrato con Mielina');
    error.codigo = revision.motivo;
    throw error;
  }
  const envio = { id: crypto.randomUUID(), referencias, pagina: C.paginaValida(pagina) };
  const base = { envio, pestanaOrigen: pestanaOrigen ?? null, creado: Date.now() };

  // 1. Una pestaña de la biblioteca ya abierta: primero la de la misma ventana, después la usada más reciente
  let ventanaDeOrigen = null;
  if (pestanaOrigen != null) ventanaDeOrigen = (await chrome.tabs.get(pestanaOrigen).catch(() => null))?.windowId ?? null;
  const abiertas = await chrome.tabs.query({ url: patronesDeLaBiblioteca() });
  abiertas.sort((a, b) => (b.windowId === ventanaDeOrigen) - (a.windowId === ventanaDeOrigen) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  for (const pestana of abiertas) {
    let respuesta = null;
    try {
      respuesta = await chrome.tabs.sendMessage(pestana.id, { tipo: 'ranvier/entregar', envio }, { frameId: 0 });
    } catch {
      // Sin puente: la pestaña se abrió antes de instalar (o actualizar) Ranvier
    }
    if (respuesta?.recibido) {
      await guardarPendiente({ ...base, pestana: pestana.id });
      await enfocar(pestana);
      return { pestana: pestana.id, nueva: false };
    }
  }

  // 2. Una pestaña nueva, que pide el envío al cargar
  await guardarPendiente({ ...base, pestana: null });
  const nueva = await chrome.tabs.create({ url: `${MIELINA}${C.RUTA_DE_LA_BIBLIOTECA}`, active: true });
  await guardarPendiente({ ...base, pestana: nueva.id });
  await chrome.windows.update(nueva.windowId, { focused: true }).catch(() => {});
  return { pestana: nueva.id, nueva: true };
}

/** El puente de una pestaña de la biblioteca pide, al cargar, si hay un envío para ella. */
export async function envioParaPestana(pestanaId) {
  const pendiente = await leerPendiente();
  if (!pendiente) return null;
  if (pendiente.pestana === pestanaId || pendiente.pestana === null) return pendiente.envio;
  return null;
}

/** El texto de la insignia y su descripción, según lo que respondió Mielina. */
export function insigniaDelResultado(resultado) {
  if (resultado.cancelado) {
    return { texto: '–', titulo: 'Mielina no guardó nada: se canceló.', exito: false };
  }
  const { guardadas, yaEstaban, omitidas } = resultado;
  const partes = [`Mielina guardó ${guardadas} ${guardadas === 1 ? 'referencia' : 'referencias'}`];
  if (yaEstaban) partes.push(`${yaEstaban} ya ${yaEstaban === 1 ? 'estaba' : 'estaban'}`);
  if (omitidas) partes.push(`${omitidas} no se ${omitidas === 1 ? 'pudo' : 'pudieron'} guardar`);
  return {
    texto: guardadas ? String(Math.min(guardadas, 999)) : '0',
    titulo: `${partes.join('; ')}.`,
    exito: guardadas > 0,
  };
}

async function mostrarInsignia(resultado, pestanas) {
  const { texto, titulo, exito } = insigniaDelResultado(resultado);
  const tituloNormal = chrome.runtime.getManifest().action.default_title;
  for (const tabId of pestanas) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: exito ? '#F0BC5E' : '#A39887' }).catch(() => {});
    await chrome.action.setBadgeTextColor({ tabId, color: '#1E160A' }).catch(() => {});
    await chrome.action.setBadgeText({ tabId, text: texto }).catch(() => {});
    await chrome.action.setTitle({ tabId, title: `${titulo} ${tituloNormal}.` }).catch(() => {});
  }
  setTimeout(() => {
    for (const tabId of pestanas) {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
      chrome.action.setTitle({ tabId, title: tituloNormal }).catch(() => {});
    }
  }, DURACION_DE_LA_INSIGNIA);
}

/**
 * Mielina respondió (`mielina/recibidas`, por el puente). Se olvida el envío y se muestra la respuesta en la insignia,
 * en la pestaña de Mielina y en la de la página que se leyó.
 * @returns {Promise<object|null>} La respuesta, si era la de este envío.
 */
export async function alResponderMielina({ id, resultado }, pestanaDeMielina) {
  const pendiente = await leerPendiente();
  if (!pendiente || pendiente.envio.id !== id) return null;
  const limpio = C.leerRecibidas({ tipo: 'mielina/recibidas', version: C.VERSION, ...resultado });
  if (!limpio) return null;
  await chrome.storage.session.remove(CLAVE);
  await chrome.storage.session.set({ ultimaRespuesta: { ...limpio, cuando: Date.now() } });
  const pestanas = [pestanaDeMielina, pendiente.pestanaOrigen].filter((p) => Number.isInteger(p));
  await mostrarInsignia(limpio, [...new Set(pestanas)]);
  return limpio;
}
