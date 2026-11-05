/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * El fondo de la extensión (service worker). Atiende:
 * - la ventana del botón (`ventana/`), por un puerto: leer la pestaña, elegir de una lista y mandar a Mielina;
 * - el documento fuera de pantalla: las peticiones HTTP de los traductores y la pregunta de qué referencias elegir;
 * - el puente en la biblioteca de Mielina: pedir el envío y pasar la respuesta.
 */

import '../comun/contrato.js';
import { leerPestana, operaciones, ErrorDeRanvier } from './lectura.js';
import { pedirParaTraductor } from './http.js';
import { entregar, envioParaPestana, alResponderMielina } from './entrega.js';

const C = globalThis.RanvierContrato;

/** Los datos de un error para la ventana. */
function errorParaLaVentana(e) {
  if (e instanceof ErrorDeRanvier) {
    const { codigo, sitio, referencias, pagina, detalle } = e;
    return { tipo: 'error', codigo, sitio, referencias, pagina, detalle };
  }
  if (e?.codigo) return { tipo: 'error', codigo: e.codigo };
  return { tipo: 'error', codigo: 'falloAlTraducir', detalle: String(e?.message || e) };
}

/** Una conversación con la ventana del botón, de un clic. */
function atenderVentana(puerto) {
  let abierta = true;
  let enCurso = false;
  let alCancelar = null;
  let responderEleccion = null;
  const enviar = (mensaje) => {
    if (abierta) puerto.postMessage(mensaje);
  };

  puerto.onDisconnect.addListener(() => {
    abierta = false;
    responderEleccion?.(null);
    alCancelar?.();
  });

  async function mandarAMielina(referencias, pagina, pestanaOrigen) {
    enviar({ tipo: 'estado', estado: 'abriendoMielina', cuantas: referencias.length });
    const { nueva } = await entregar({ referencias, pagina, pestanaOrigen });
    enviar({ tipo: 'enviado', cuantas: referencias.length, nueva });
  }

  puerto.onMessage.addListener(async (mensaje) => {
    if (mensaje?.tipo === 'elegidas') {
      responderEleccion?.(Array.isArray(mensaje.claves) ? mensaje.claves.slice(0, C.MAX_REFERENCIAS) : null);
      responderEleccion = null;
      return;
    }
    if ((mensaje?.tipo !== 'leer' && mensaje?.tipo !== 'mandar') || enCurso || !Number.isInteger(mensaje.pestana)) return;
    enCurso = true;
    try {
      if (mensaje.tipo === 'mandar') {
        // Lo que se encontró aunque faltó el permiso: el estudiante decidió mandarlo así
        await mandarAMielina(mensaje.referencias, mensaje.pagina, mensaje.pestana);
        return;
      }
      const { referencias, pagina } = await leerPestana(mensaje.pestana, {
        avisar: (estado) => enviar({ tipo: 'estado', estado }),
        elegir: (opciones) => new Promise((resolver) => {
          if (!abierta) return resolver(null);
          responderEleccion = resolver;
          enviar({ tipo: 'elegir', opciones, maximo: C.MAX_REFERENCIAS });
        }),
        alCancelar: (fn) => {
          alCancelar = fn;
        },
      });
      if (!abierta) return; // Si el estudiante cerró la ventana, no se manda nada
      await mandarAMielina(referencias, pagina, mensaje.pestana);
    } catch (e) {
      if (e?.codigo !== 'cancelada') enviar(errorParaLaVentana(e));
    } finally {
      enCurso = false;
    }
  });
}

chrome.runtime.onConnect.addListener((puerto) => {
  const desdeLaVentana = puerto.sender?.id === chrome.runtime.id
    && String(puerto.sender?.url || '').startsWith(chrome.runtime.getURL('ventana/'));
  if (puerto.name === 'ventana' && desdeLaVentana) atenderVentana(puerto);
  else puerto.disconnect();
});

/** Lo que piden el documento fuera de pantalla y el puente de Mielina. */
async function atenderMensaje(mensaje, remitente) {
  if (mensaje.destino === 'fondo') {
    // Del documento fuera de pantalla (una página de la extensión, sin pestaña)
    if (remitente.tab || !String(remitente.url || '').startsWith(chrome.runtime.getURL('fueraDePantalla/'))) return undefined;
    if (mensaje.tipo === 'latido') return { resultado: true };
    const operacion = operaciones.get(mensaje.operacion);
    if (!operacion) return { error: { name: 'Error', message: 'La operación ya terminó' } };
    if (mensaje.tipo === 'http') return { resultado: await pedirParaTraductor(mensaje.peticion, operacion) };
    if (mensaje.tipo === 'elegir') return { resultado: await operacion.elegir(mensaje.opciones) };
    return undefined;
  }
  // Del puente, en una pestaña de la biblioteca de Mielina
  if (!remitente.tab || remitente.frameId !== 0) return undefined;
  if (mensaje.tipo === 'ranvier/pedirEnvio') return { envio: await envioParaPestana(remitente.tab.id) };
  if (mensaje.tipo === 'ranvier/recibidas') return { ok: !!(await alResponderMielina(mensaje, remitente.tab.id)) };
  return undefined;
}

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  if (remitente.id !== chrome.runtime.id || !mensaje || typeof mensaje !== 'object') return false;
  if (mensaje.destino === 'fueraDePantalla') return false;
  atenderMensaje(mensaje, remitente).then(
    (respuesta) => responder(respuesta),
    (e) => responder({ error: { name: 'Error', message: String(e?.message || e) } }),
  );
  return true;
});
