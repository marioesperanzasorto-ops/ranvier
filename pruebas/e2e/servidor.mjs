/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Los servidores de las pruebas de punta a punta:
 * - las páginas que se leen (`paginas/`), en http://127.0.0.1, con un servidor unAPI (`/unapi`) que da RIS;
 * - otro sitio (otro puerto) con el mismo unAPI pero sin CORS: para leerlo hace falta el permiso de sitios;
 * - una Mielina falsa en http://localhost (otro origen), con su `/biblioteca` (`paginas/mielina.html`).
 * Los datos son inventados.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGINAS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'paginas');

const RIS = [
  'TY  - BOOK',
  'AU  - Méndez, Laura',
  'TI  - Agua y comunidad en los valles altos',
  'PY  - 2019',
  'PB  - Editorial Ficticia',
  'CY  - Santa Ana',
  'ER  - ',
  '',
].join('\r\n');

const FORMATOS = '<?xml version="1.0" encoding="UTF-8"?>\n<formats id="libro-7">'
  + '<format name="ris" type="application/x-research-info-systems" docs="http://www.refman.com/support/risformat_intro.asp"/>'
  + '</formats>';

/** La Mielina falsa: el mismo trato que `src/biblioteca/recolector/contrato.ts` de Mielina, según el contrato público. */
function codigoDeMielina(modo) {
  return `
const MODO = ${JSON.stringify(modo)};
window.recibidos = [];
const estado = document.getElementById('estado');
window.addEventListener('message', (evento) => {
  if (evento.source !== window || evento.origin !== window.location.origin) return;
  const datos = evento.data;
  if (!datos || typeof datos !== 'object' || datos.tipo !== 'mielina/referencias' || datos.version !== 1 || datos.formato !== 'csl-json') return;
  if (!Array.isArray(datos.referencias) || datos.referencias.length < 1 || datos.referencias.length > 200) return;
  if (JSON.stringify(datos).length > 5 * 1024 * 1024) return;
  window.recibidos.push(datos);
  estado.textContent = 'Recibidas: ' + datos.referencias.length;
  if (MODO === 'callar') return;
  const respuesta = MODO === 'cancelar'
    ? { tipo: 'mielina/recibidas', version: 1, cancelado: true }
    : { tipo: 'mielina/recibidas', version: 1, guardadas: datos.referencias.length, yaEstaban: 0, omitidas: 0 };
  setTimeout(() => window.postMessage(respuesta, window.location.origin), 50);
});
// Como Mielina: avisa que está lista cuando ya leyó la biblioteca, un momento después de cargar
setTimeout(() => window.postMessage({ tipo: 'mielina/lista', version: 1 }, window.location.origin), 150);
`;
}

function escuchar(servidor, host) {
  return new Promise((resolver) => servidor.listen(0, host, () => resolver(servidor.address().port)));
}

function responderUnapi(url, respuesta) {
  const conFormato = url.searchParams.get('format');
  respuesta.writeHead(200, { 'Content-Type': conFormato ? 'application/x-research-info-systems; charset=utf-8' : 'application/xml; charset=utf-8' });
  respuesta.end(conFormato ? RIS : FORMATOS);
}

export async function iniciarServidores() {
  const estado = { modo: 'guardar', peticionesUnapi: [], peticionesDelOtroSitio: [] };

  // Otro sitio, sin CORS
  const otro = createServer((pedido, respuesta) => {
    const url = new URL(pedido.url, 'http://127.0.0.1');
    estado.peticionesDelOtroSitio.push(url.pathname + url.search);
    if (url.pathname === '/unapi') responderUnapi(url, respuesta);
    else respuesta.writeHead(404).end();
  });
  const puertoDelOtro = await escuchar(otro, '127.0.0.1');

  const paginas = createServer(async (pedido, respuesta) => {
    const url = new URL(pedido.url, 'http://127.0.0.1');
    if (url.pathname === '/unapi') {
      estado.peticionesUnapi.push({ url: url.search, cookie: pedido.headers.cookie || '' });
      responderUnapi(url, respuesta);
      return;
    }
    if (url.pathname === '/unapi-de-otro-sitio.html') {
      const html = (await readFile(path.join(PAGINAS, 'unapi.html'), 'utf8'))
        .replace('href="/unapi"', `href="http://127.0.0.1:${puertoDelOtro}/unapi"`);
      respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      respuesta.end(html);
      return;
    }
    const nombre = path.basename(url.pathname);
    if (!/^[\w-]+\.html$/.test(nombre) || nombre === 'mielina.html') {
      respuesta.writeHead(404).end();
      return;
    }
    try {
      const html = await readFile(path.join(PAGINAS, nombre));
      // Una cookie de sesión del sitio: las peticiones de los traductores a su mismo sitio deben llevarla
      respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'sesion=prueba; Path=/; SameSite=Lax' });
      respuesta.end(html);
    } catch {
      respuesta.writeHead(404).end();
    }
  });

  const mielina = createServer(async (pedido, respuesta) => {
    const url = new URL(pedido.url, 'http://localhost');
    if (url.pathname === '/biblioteca') {
      respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "script-src 'self'" });
      respuesta.end(await readFile(path.join(PAGINAS, 'mielina.html')));
    } else if (url.pathname === '/biblioteca.js') {
      respuesta.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      respuesta.end(codigoDeMielina(estado.modo));
    } else {
      respuesta.writeHead(404).end();
    }
  });

  const puertoDePaginas = await escuchar(paginas, '127.0.0.1');
  const puertoDeMielina = await escuchar(mielina, 'localhost');
  return {
    estado,
    paginas: `http://127.0.0.1:${puertoDePaginas}`,
    mielina: `http://localhost:${puertoDeMielina}`,
    async cerrar() {
      for (const servidor of [paginas, mielina, otro]) servidor.closeAllConnections?.();
      await Promise.all([paginas, mielina, otro].map((servidor) => new Promise((r) => servidor.close(r))));
    },
  };
}
