/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * Un canal de llamadas sobre un `MessagePort`: cada lado registra sus funciones y llama las del otro, y cada llamada
 * devuelve una promesa. Lo usan el documento fuera de pantalla y el marco aislado donde corren los traductores
 * (`traductor/`). Es un script clásico: también se puede importar como módulo, porque solo deja `RanvierCanal` en
 * `globalThis`.
 */
(() => {
  /** Un error que cruza el canal: solo sus datos, porque los objetos `Error` no se clonan con todo. */
  function serializarError(e) {
    if (e && typeof e === 'object') {
      const datos = { name: String(e.name || 'Error'), message: String(e.message || e) };
      for (const clave of ['codigo', 'status', 'origen']) {
        if (e[clave] !== undefined) datos[clave] = e[clave];
      }
      return datos;
    }
    return { name: 'Error', message: String(e) };
  }

  function errorDesdeDatos(datos) {
    const error = new Error(datos?.message || 'Error');
    Object.assign(error, datos || {});
    return error;
  }

  class Canal {
    /**
     * @param {MessagePort} puerto
     * @param {Record<string, Function>} funciones Las que el otro lado puede llamar.
     */
    constructor(puerto, funciones = {}) {
      this.puerto = puerto;
      this.funciones = funciones;
      this.pendientes = new Map();
      this.siguiente = 1;
      this.cerrado = false;
      puerto.onmessage = (evento) => this._recibir(evento.data);
    }

    /** Llama una función del otro lado. */
    llamar(metodo, ...args) {
      if (this.cerrado) return Promise.reject(new Error('El canal está cerrado'));
      const id = this.siguiente++;
      return new Promise((resolver, rechazar) => {
        this.pendientes.set(id, { resolver, rechazar });
        this.puerto.postMessage({ id, metodo, args });
      });
    }

    async _recibir(mensaje) {
      if (!mensaje || typeof mensaje !== 'object' || this.cerrado) return;
      if (typeof mensaje.metodo === 'string') {
        const funcion = Object.hasOwn(this.funciones, mensaje.metodo) ? this.funciones[mensaje.metodo] : null;
        try {
          if (typeof funcion !== 'function') throw new Error(`El canal no ofrece «${mensaje.metodo}»`);
          const resultado = await funcion(...(Array.isArray(mensaje.args) ? mensaje.args : []));
          if (!this.cerrado) this.puerto.postMessage({ respuesta: mensaje.id, resultado });
        } catch (e) {
          if (!this.cerrado) this.puerto.postMessage({ respuesta: mensaje.id, error: serializarError(e) });
        }
        return;
      }
      if (mensaje.respuesta === undefined) return;
      const pendiente = this.pendientes.get(mensaje.respuesta);
      if (!pendiente) return;
      this.pendientes.delete(mensaje.respuesta);
      if (mensaje.error) pendiente.rechazar(errorDesdeDatos(mensaje.error));
      else pendiente.resolver(mensaje.resultado);
    }

    /** Cierra el canal: lo que esperaba respuesta falla. */
    cerrar(motivo = 'El canal se cerró') {
      if (this.cerrado) return;
      this.cerrado = true;
      for (const { rechazar } of this.pendientes.values()) rechazar(new Error(motivo));
      this.pendientes.clear();
      try {
        this.puerto.close();
      } catch {
        // Ya estaba cerrado
      }
    }
  }

  globalThis.RanvierCanal = Object.freeze({ Canal, serializarError, errorDesdeDatos });
})();
