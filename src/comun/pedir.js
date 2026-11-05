/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * Hace una petición HTTP de un traductor con `fetch` y la devuelve como datos que se pueden mandar entre partes de la
 * extensión. Lo usan la página que se lee (`contenido/leerPagina.js`: su mismo sitio, con sus cookies) y el fondo de
 * la extensión (otros sitios, solo con el permiso que da el estudiante). Script clásico que deja `RanvierPedir` en
 * `globalThis`; el fondo lo importa como módulo.
 */
(() => {
  /** Lo más grande que se lee de una respuesta. */
  const MAX_BYTES = 20 * 1024 * 1024;
  const METODOS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'OPTIONS']);

  /** El juego de caracteres de la respuesta: el pedido, el de la cabecera o el de un `<meta>` del HTML. */
  function juegoDeCaracteres(pedido, tipoDeContenido, bytes) {
    if (pedido) return pedido;
    const deLaCabecera = /charset\s*=\s*"?([\w.:-]+)/i.exec(tipoDeContenido || '');
    if (deLaCabecera) return deLaCabecera[1];
    if (/html|xml/i.test(tipoDeContenido || '')) {
      const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
      const deMeta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(inicio)
        || /<\?xml[^>]+encoding\s*=\s*["']([\w.:-]+)/i.exec(inicio);
      if (deMeta) return deMeta[1];
    }
    return 'utf-8';
  }

  function decodificar(bytes, juego) {
    try {
      return new TextDecoder(juego).decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  function aBase64(bytes) {
    let binario = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binario);
  }

  /**
   * @param {{ metodo: string, url: string, cuerpo?: string|null, cabeceras?: Record<string, string>, tiempo?: number,
   *   juegoDeCaracteres?: string|null, binario?: boolean }} peticion
   * @param {{ credenciales?: RequestCredentials }} [opciones]
   * @returns {Promise<object>} `{ status, statusText, url, cabeceras, texto | base64 }`, o `{ fallo }` si la red falló
   *   (o el sitio no deja leer su respuesta), o `{ tiempoAgotado: true }`.
   */
  async function pedir(peticion, { credenciales = 'same-origin' } = {}) {
    const url = new URL(String(peticion?.url));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { fallo: `No se piden direcciones ${url.protocol}` };
    const metodo = String(peticion.metodo || 'GET').toUpperCase();
    if (!METODOS.has(metodo)) return { fallo: `No se hacen peticiones ${metodo}` };

    const cabeceras = new Headers();
    let referente;
    for (const [nombre, valor] of Object.entries(peticion.cabeceras || {})) {
      if (typeof valor !== 'string') continue;
      // El navegador no deja poner Referer como cabecera: va como opción
      if (nombre.toLowerCase() === 'referer') referente = valor;
      else {
        try {
          cabeceras.set(nombre, valor);
        } catch {
          // Una cabecera que el navegador no deja poner
        }
      }
    }

    const controlador = new AbortController();
    const reloj = setTimeout(() => controlador.abort(), Math.min(Number(peticion.tiempo) || 15000, 120000));
    try {
      const opciones = {
        method: metodo,
        headers: cabeceras,
        credentials: credenciales,
        redirect: 'follow',
        signal: controlador.signal,
      };
      if (peticion.cuerpo != null && metodo !== 'GET' && metodo !== 'HEAD') opciones.body = String(peticion.cuerpo);
      if (referente) opciones.referrer = referente;
      let respuesta;
      try {
        respuesta = await fetch(url.href, opciones);
      } catch (e) {
        // Un referente de otro sitio no se puede poner: se prueba sin él
        if (!referente || e?.name === 'AbortError') throw e;
        delete opciones.referrer;
        respuesta = await fetch(url.href, opciones);
      }
      const bytes = new Uint8Array(await respuesta.arrayBuffer());
      if (bytes.length > MAX_BYTES) return { fallo: 'La respuesta es demasiado grande' };
      let lineas = '';
      for (const [nombre, valor] of respuesta.headers.entries()) lineas += `${nombre}: ${valor}\r\n`;
      const datos = { status: respuesta.status, statusText: respuesta.statusText, url: respuesta.url || url.href, cabeceras: lineas };
      if (peticion.binario) datos.base64 = aBase64(bytes);
      else datos.texto = decodificar(bytes, juegoDeCaracteres(peticion.juegoDeCaracteres, respuesta.headers.get('content-type'), bytes));
      return datos;
    } catch (e) {
      if (e?.name === 'AbortError') return { tiempoAgotado: true };
      return { fallo: String(e?.message || e || 'Failed to fetch') };
    } finally {
      clearTimeout(reloj);
    }
  }

  globalThis.RanvierPedir = Object.freeze({ pedir, MAX_BYTES });
})();
