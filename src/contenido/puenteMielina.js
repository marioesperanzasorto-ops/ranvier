/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * El puente en la biblioteca de Mielina (`/biblioteca`; el manifiesto lo pone solo ahí). Sigue el contrato
 * (`comun/contrato.js`): espera que la página avise que está lista (`mielina/lista`), le manda las referencias
 * (`mielina/referencias`, en la misma ventana y al mismo origen) y le pasa al fondo de la extensión la respuesta
 * (`mielina/recibidas`). No lee nada más de la página.
 */
(() => {
  const C = globalThis.RanvierContrato;
  /** Si la página ya avisó que está lista. */
  let vistaLista = false;
  /** El envío que falta entregar: `{ id, referencias, pagina }`. */
  let envio = null;
  /** Si el envío ya se le mandó a la página (desde el último aviso de que está lista). */
  let mandado = false;

  function alFondo(mensaje) {
    try {
      chrome.runtime.sendMessage(mensaje).catch(() => {});
    } catch {
      // La extensión se actualizó o se quitó: este puente ya no sirve
    }
  }

  function mandar() {
    if (!envio || !vistaLista) return;
    window.postMessage(C.mensajeDeReferencias(envio.referencias, envio.pagina), window.location.origin);
    mandado = true;
  }

  window.addEventListener('message', (evento) => {
    if (evento.source !== window || evento.origin !== window.location.origin) return;
    if (C.esLista(evento.data)) {
      // Si la página vuelve a avisar (por ejemplo, después de entrar otra vez), lo pendiente se manda de nuevo
      vistaLista = true;
      mandado = false;
      mandar();
      return;
    }
    const resultado = C.leerRecibidas(evento.data);
    if (!resultado || !envio || !mandado) return;
    alFondo({ tipo: 'ranvier/recibidas', id: envio.id, resultado });
    envio = null;
    mandado = false;
  });

  chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
    if (remitente.id !== chrome.runtime.id || mensaje?.tipo !== 'ranvier/entregar' || !mensaje.envio) return false;
    envio = mensaje.envio;
    mandado = false;
    mandar();
    responder({ recibido: true, vistaLista });
    return false;
  });

  // Al cargar, por si el envío es para esta pestaña (se abrió para eso)
  try {
    chrome.runtime.sendMessage({ tipo: 'ranvier/pedirEnvio' }).then((respuesta) => {
      if (respuesta?.envio && !envio) {
        envio = respuesta.envio;
        mandar();
      }
    }, () => {});
  } catch {
    // Sin extensión
  }
})();
