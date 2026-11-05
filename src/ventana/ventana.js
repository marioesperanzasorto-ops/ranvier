/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza.
 * Software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License, versión 3 o
 * (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye SIN NINGUNA
 * GARANTÍA. Mira el archivo LICENSE.
 */

/**
 * La ventana del botón. Al abrirse (el clic del estudiante), le pide al fondo que lea la pestaña activa y muestra cada
 * paso. Si la página es una lista, el estudiante elige aquí; si falta el permiso de sitios, se le pide aquí. El texto
 * de la página nunca entra como HTML: solo con `textContent`.
 */

import { PERMISO_DE_SITIOS, REPOSITORIO } from '../comun/config.js';

const $ = (id) => document.getElementById(id);

const ESTADOS = {
  leyendo: 'Leyendo la página…',
  buscando: 'Buscando la referencia…',
  traduciendo: 'Sacando los datos de la referencia…',
  abriendoMielina: 'Abriendo tu biblioteca de Mielina…',
};

/** Cada error: su título, su explicación y, si hay, una nota y lo que se puede hacer. */
const ERRORES = {
  noSePuedeLeer: {
    titulo: 'No puedo leer esta página',
    texto: 'Ranvier no lee las páginas del navegador, las de la tienda de extensiones ni los archivos de tu computadora.',
  },
  paginaMuyGrande: {
    titulo: 'La página es demasiado grande',
    texto: 'Abre la página de una sola referencia y vuelve a hacer clic en Ranvier.',
  },
  sinReferencias: {
    titulo: 'No encontré una referencia aquí',
    texto: 'Abre la página del artículo, del libro o de la noticia (no el PDF) y vuelve a hacer clic en Ranvier.',
  },
  ningunaElegida: {
    titulo: 'No elegiste ninguna referencia',
    texto: 'No se mandó nada a Mielina.',
  },
  faltaPermiso: {
    titulo: 'Falta un permiso',
    texto: 'Esta página trae los datos de la referencia de otro sitio ({sitio}). Para leerlos, Ranvier necesita permiso '
      + 'para entrar en otros sitios, solo cuando haces clic en él. Se pide una sola vez.',
    nota: 'Si esta ventana se cierra al dar el permiso, vuelve a hacer clic en Ranvier.',
    permiso: true,
  },
  ninguna: {
    titulo: 'No hay nada que mandar',
    texto: 'No encontré ninguna referencia para mandar a Mielina.',
  },
  demasiadas: {
    titulo: 'Son demasiadas referencias',
    texto: 'Mielina recibe hasta 200 de una vez. Elige menos.',
  },
  muyGrande: {
    titulo: 'Es demasiado para mandar',
    texto: 'Las referencias pasan del tamaño que Mielina recibe de una vez. Elige menos.',
  },
  falloAlTraducir: {
    titulo: 'Algo falló al leer la referencia',
    texto: 'Vuelve a intentarlo. Si sigue fallando, puede que la página haya cambiado su forma.',
    reintentar: true,
  },
};

let puerto = null;
let pestana = null;
let latido = null;

function mostrar(seccion) {
  for (const id of ['estado', 'elegir', 'listo', 'error']) $(id).hidden = id !== seccion;
}

function mostrarEstado(estado) {
  $('estado-texto').textContent = ESTADOS[estado] || ESTADOS.leyendo;
  mostrar('estado');
}

function plural(n, uno, varios) {
  return n === 1 ? uno : varios;
}

function mostrarEnviado({ cuantas, nueva }) {
  $('listo-titulo').textContent = 'Listo';
  const que = cuantas === 1 ? 'la referencia' : `las ${cuantas} referencias`;
  const donde = nueva ? 'Abrí tu biblioteca de Mielina' : 'Te llevé a tu biblioteca de Mielina';
  $('listo-texto').textContent = `${donde}. Revisa ${que} antes de guardar${plural(cuantas, 'la', 'las')}: nada se guarda sin que lo confirmes.`;
  mostrar('listo');
}

function mostrarError(datos) {
  const error = ERRORES[datos.codigo] || ERRORES.falloAlTraducir;
  $('error-titulo').textContent = error.titulo;
  $('error-texto').textContent = error.texto.replace('{sitio}', datos.sitio || 'otro sitio');
  const nota = error.nota || (datos.codigo === 'falloAlTraducir' && datos.detalle ? `Detalle: ${datos.detalle}` : '');
  $('error-nota').textContent = nota;
  $('error-nota').hidden = !nota;
  const hayReferencias = Array.isArray(datos.referencias) && datos.referencias.length > 0;
  $('dar-permiso').hidden = !error.permiso;
  $('mandar-igual').hidden = !(error.permiso && hayReferencias);
  $('reintentar').hidden = !error.reintentar;
  $('error-botones').hidden = !(error.permiso || error.reintentar);
  $('dar-permiso').onclick = () => darPermiso();
  $('mandar-igual').onclick = () => {
    conectar().postMessage({ tipo: 'mandar', pestana, referencias: datos.referencias, pagina: datos.pagina });
  };
  $('reintentar').onclick = () => leer();
  mostrar('error');
}

/** La lista para elegir. `maximo`: las que caben en un envío. */
function mostrarEleccion(opciones, maximo) {
  const lista = $('opciones');
  lista.replaceChildren();
  const casillas = [];
  for (const { clave, titulo } of opciones) {
    const fila = document.createElement('li');
    const etiqueta = document.createElement('label');
    const casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.value = clave;
    const texto = document.createElement('span');
    texto.textContent = titulo.trim() || 'Sin título';
    etiqueta.append(casilla, texto);
    fila.append(etiqueta);
    lista.append(fila);
    casillas.push(casilla);
  }

  const actualizar = () => {
    const elegidas = casillas.filter((c) => c.checked).length;
    $('cuenta').textContent = `${elegidas} de ${casillas.length}`;
    $('mandar').disabled = elegidas === 0 || elegidas > maximo;
    $('mandar').textContent = elegidas > 0 ? `Mandar ${elegidas} a Mielina` : 'Mandar a Mielina';
    $('marcar-todas').checked = elegidas > 0 && elegidas === Math.min(casillas.length, maximo);
    $('limite').hidden = elegidas <= maximo && casillas.length <= maximo;
    $('limite').textContent = `Mielina recibe hasta ${maximo} referencias de una vez.`;
  };
  for (const casilla of casillas) casilla.addEventListener('change', actualizar);
  $('marcar-todas').checked = false;
  $('marcar-todas').onchange = () => {
    const marcar = $('marcar-todas').checked;
    casillas.forEach((c, i) => {
      c.checked = marcar && i < maximo;
    });
    actualizar();
  };
  const responder = (claves) => {
    puerto?.postMessage({ tipo: 'elegidas', claves });
    mostrarEstado('traduciendo');
  };
  $('mandar').onclick = () => responder(casillas.filter((c) => c.checked).map((c) => c.value));
  $('cancelar').onclick = () => responder([]);
  actualizar();
  mostrar('elegir');
}

function conectar() {
  if (puerto) return puerto;
  puerto = chrome.runtime.connect({ name: 'ventana' });
  puerto.onMessage.addListener((mensaje) => {
    if (mensaje.tipo === 'estado') mostrarEstado(mensaje.estado);
    else if (mensaje.tipo === 'elegir') mostrarEleccion(mensaje.opciones, mensaje.maximo);
    else if (mensaje.tipo === 'enviado') mostrarEnviado(mensaje);
    else if (mensaje.tipo === 'error') mostrarError(mensaje);
  });
  puerto.onDisconnect.addListener(() => {
    puerto = null;
  });
  // Mientras la ventana esté abierta (por ejemplo, eligiendo de una lista), el fondo no se duerme
  latido ??= setInterval(() => puerto?.postMessage({ tipo: 'latido' }), 20e3);
  return puerto;
}

function leer() {
  mostrarEstado('leyendo');
  conectar().postMessage({ tipo: 'leer', pestana });
}

async function darPermiso() {
  // Se pide en el clic: el navegador muestra su propia pregunta
  const concedido = await chrome.permissions.request(PERMISO_DE_SITIOS);
  if (concedido) leer();
}

async function iniciar() {
  $('codigo').href = REPOSITORIO;
  const [activa] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activa?.id) {
    mostrarError({ codigo: 'noSePuedeLeer' });
    return;
  }
  pestana = activa.id;
  leer();
}

iniciar();
