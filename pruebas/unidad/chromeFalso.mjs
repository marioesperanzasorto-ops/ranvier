/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Un `chrome` falso para probar el fondo de la extensión en Node: pestañas, mensajes, permisos, la sesión y la
 * insignia. Cada prueba arma el suyo y lo pone en `globalThis.chrome`.
 */
export function chromeFalso({ pestanas = [], permisos = [], respuestas = () => undefined } = {}) {
  const sesion = new Map();
  const llamadas = [];
  const insignias = new Map();
  let siguienteId = 100;
  const registrar = (nombre, ...args) => llamadas.push({ nombre, args: structuredClone(args) });

  const chrome = {
    llamadas,
    insignias,
    pestanas,
    runtime: {
      id: 'ranvier',
      getManifest: () => ({ action: { default_title: 'Mandar la referencia de esta página a Mielina' } }),
    },
    storage: {
      session: {
        async get(clave) {
          return sesion.has(clave) ? { [clave]: structuredClone(sesion.get(clave)) } : {};
        },
        async set(objeto) {
          for (const [k, v] of Object.entries(objeto)) sesion.set(k, structuredClone(v));
        },
        async remove(clave) {
          sesion.delete(clave);
        },
      },
    },
    tabs: {
      async query({ url }) {
        registrar('tabs.query', url);
        const patrones = (Array.isArray(url) ? url : [url]).map((p) => new RegExp(`^${p.replace(/[.?+^$|()[\]{}\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
        return pestanas.filter((p) => patrones.some((r) => r.test(p.url)));
      },
      async get(id) {
        const pestana = pestanas.find((p) => p.id === id);
        if (!pestana) throw new Error('No hay pestaña');
        return pestana;
      },
      async sendMessage(id, mensaje, opciones) {
        registrar('tabs.sendMessage', id, mensaje, opciones);
        const respuesta = await respuestas(id, mensaje);
        if (respuesta instanceof Error) throw respuesta;
        if (respuesta === undefined) throw new Error('Could not establish connection. Receiving end does not exist.');
        return respuesta;
      },
      async update(id, cambios) {
        registrar('tabs.update', id, cambios);
        return pestanas.find((p) => p.id === id);
      },
      async create(datos) {
        registrar('tabs.create', datos);
        const pestana = { id: siguienteId++, windowId: 1, url: datos.url };
        pestanas.push(pestana);
        return pestana;
      },
    },
    windows: {
      async update(id, cambios) {
        registrar('windows.update', id, cambios);
      },
    },
    permissions: {
      async contains({ origins }) {
        registrar('permissions.contains', origins);
        return origins.every((o) => permisos.includes(o) || permisos.includes('*'));
      },
    },
    action: {
      async setBadgeText({ tabId, text }) {
        insignias.set(tabId, { ...insignias.get(tabId), texto: text });
      },
      async setBadgeBackgroundColor({ tabId, color }) {
        insignias.set(tabId, { ...insignias.get(tabId), color });
      },
      async setBadgeTextColor() {},
      async setTitle({ tabId, title }) {
        insignias.set(tabId, { ...insignias.get(tabId), titulo: title });
      },
    },
  };
  globalThis.chrome = chrome;
  return chrome;
}
