# Ranvier (Mielina)

Ranvier es una extensión para Chrome y Edge que saca la referencia de la página que estás leyendo (un artículo, un
libro, una tesis, una noticia…) y la manda a tu biblioteca de [Mielina](https://mielinapp.com), el editor para escribir
en APA 7. **Usa los traductores de Zotero**, que reconocen cientos de sitios: revistas, bases de datos, catálogos de
bibliotecas, editoriales y periódicos.

Ranvier es software libre, con la licencia [GNU AGPL 3.0](LICENSE). Su código fuente completo está en este repositorio:
<https://github.com/marioesperanzasorto-ops/ranvier>.

> El nombre: en una neurona, la mielina envuelve el axón por tramos, y entre tramo y tramo queda un **nodo de
> Ranvier**, por donde salta la señal. Ranvier es el salto entre la página que lees y tu biblioteca de Mielina.

## Cómo funciona

1. Haces clic en el botón de Ranvier. **Antes de ese clic, Ranvier no lee nada.**
2. Ranvier lee la página que tienes abierta y busca el traductor que sirve para ella. Los traductores corren en un marco
   aislado, sin acceso a tu navegador ni a la red.
3. Si la página es una lista (los resultados de una búsqueda, por ejemplo), eliges qué referencias quieres.
4. Las referencias pasan a CSL-JSON, el formato público de Citation Style Language.
5. Ranvier abre tu biblioteca de Mielina (o la enfoca, si ya está abierta) y se las entrega. **Mielina te muestra qué va
   a entrar y nada se guarda sin que lo confirmes.** Lo que entra llega marcado «por revisar».
6. La respuesta de Mielina (cuántas se guardaron) aparece en el botón de Ranvier.

Ranvier y Mielina son programas aparte: solo se pasan mensajes estándar del navegador (`window.postMessage`) con las
referencias en CSL-JSON. El contrato está en [docs/contrato-del-recolector.md](docs/contrato-del-recolector.md).

## Privacidad

Ranvier solo lee la página cuando haces clic, y manda la referencia solo a Mielina. No tiene servidor, no guarda tu
historial y no lee tus cookies. Los detalles: [docs/privacidad.md](docs/privacidad.md).

## Permisos

| Permiso | Para qué |
|---|---|
| `activeTab` y `scripting` | Leer la página que tienes abierta, solo cuando haces clic en el botón. |
| `offscreen` | Correr los traductores en un documento fuera de pantalla, dentro de un marco aislado. |
| `storage` | Recordar, mientras el navegador está abierto, la referencia que va a Mielina hasta que Mielina responde. |
| `https://mielinapp.com/*` | Entregar las referencias en tu biblioteca de Mielina (`/biblioteca`). |
| Otros sitios (opcional) | Algunas páginas guardan los datos de la referencia en otro sitio. Si hace falta, Ranvier te pide este permiso una sola vez. |

## Para desarrollar

Hace falta Node.js 22 o más reciente y git.

```bash
git clone https://github.com/marioesperanzasorto-ops/ranvier.git
```

Dentro de la carpeta `ranvier`, baja los submódulos de Zotero (sin `--recursive`: los submódulos de los submódulos no
hacen falta) y las dependencias:

```bash
git submodule update --init
```

```bash
npm install
```

- `npm run compilar:desarrollo` compila en `dist-desarrollo/`, que también entrega a la Mielina de desarrollo
  (`http://localhost:3000/biblioteca`). Para probarla: abre `chrome://extensions` (o `edge://extensions`), activa el
  modo de desarrollador y haz clic en «Cargar descomprimida».
- `npm test` corre la revisión, las pruebas de unidad y las de punta a punta (con Chrome for Testing, que Puppeteer
  baja al instalar).
- `npm run paquete` compila la versión de las tiendas en `dist/` y la empaqueta en `paquete/ranvier-<versión>.zip`.
- `npm run traductores:actualizar` mueve los traductores al último commit de zotero/translators. Después, `npm test` y
  un commit del submódulo.
- `npm run iconos` pasa el ícono (`src/iconos/ranvier.svg`) a PNG y arma las imágenes de la ficha (`tienda/`).

### Cómo está hecho

```
src/
  ventana/           La ventana del botón: lo que ves al hacer clic.
  fondo/             El service worker: lee la pestaña, hace las peticiones de los traductores y entrega a Mielina.
  fueraDePantalla/   El documento fuera de pantalla: abre un marco aislado para cada lectura.
  traductor/         El marco aislado (sandbox) donde corren los traductores de Zotero.
  contenido/         leerPagina.js (se pone en la página solo después del clic) y puenteMielina.js (en /biblioteca).
  comun/             El contrato con Mielina, la conversión a CSL-JSON, el canal y las peticiones HTTP.
vendor/              Los submódulos de Zotero, en commits fijos: translate, utilities, translators y zotero-schema.
pruebas/             De unidad (node:test) y de punta a punta (Puppeteer, con una Mielina falsa).
```

El mecanismo para Manifest V3 viene del conector de Zotero: la página se copia (su HTML), se pasa al documento fuera de
pantalla y de ahí a un marco aislado, donde `Zotero.Translate.Web` corre los traductores sobre esa copia. Las peticiones
de los traductores salen por un canal: a su mismo sitio, desde la página (con tu sesión en ese sitio); a otros sitios,
desde la página si lo permiten (CORS) o desde la extensión si diste el permiso de sitios. Ranvier nunca se conecta con
los servidores de Zotero: los traductores van dentro del paquete.

## Créditos

Ranvier existe gracias al trabajo de Zotero y de quienes escriben sus traductores:

- [zotero/translators](https://github.com/zotero/translators): los traductores, cada uno con sus autores en su cabecera.
- [zotero/translate](https://github.com/zotero/translate) y [zotero/utilities](https://github.com/zotero/utilities): la
  arquitectura de traducción y la conversión a CSL-JSON.
- [zotero/zotero-schema](https://github.com/zotero/zotero-schema): los tipos y campos de las referencias.
- [zotero/zotero-connectors](https://github.com/zotero/zotero-connectors): el mecanismo para Manifest V3, en el que se
  basan varios archivos de Ranvier (cada uno dice qué cambió y cuándo).

Todo ese código tiene la licencia GNU AGPL 3.0. Los detalles están en [NOTICE](NOTICE).

Ranvier no es un producto de Zotero ni de la Corporation for Digital Scholarship, y no está respaldado por ellos.
«Zotero» es una marca registrada de la Corporation for Digital Scholarship.

## Licencia

Copyright © 2026 Mario Esperanza.

Este programa es software libre: puedes redistribuirlo o modificarlo con la licencia GNU Affero General Public License,
versión 3 o (a tu elección) cualquier versión posterior, publicada por la Free Software Foundation. Se distribuye con
la esperanza de que sea útil, pero SIN NINGUNA GARANTÍA. Mira el archivo [LICENSE](LICENSE).
