# La ficha de Ranvier en las tiendas

> Los textos para la tienda de Chrome (Chrome Web Store) y la de Edge (Microsoft Edge Add-ons), y cómo publicar. Las
> imágenes están en `tienda/` (se rehacen con `npm run iconos` y `npm run capturas`). El paquete es
> `paquete/ranvier-<versión>.zip` (`npm run paquete`): el mismo para las dos tiendas.

## Los textos

**Nombre:** Ranvier (Mielina)

**Resumen** (el de `manifest.json`, 110 caracteres; Chrome acepta hasta 132):

> Saca la referencia de la página que lees y la manda a tu biblioteca de Mielina. Usa los traductores de Zotero.

**Descripción:**

> Ranvier es la extensión de Mielina, el editor para escribir en APA 7. Cuando lees un artículo, un libro, una tesis o
> una noticia, haces clic en Ranvier y la referencia llega a tu biblioteca de Mielina, lista para citarla.
>
> Cómo funciona:
> • Haces clic en el botón de Ranvier en la página que estás leyendo. Antes de ese clic, Ranvier no lee nada.
> • Ranvier reconoce la página con los traductores de Zotero, que conocen cientos de sitios: revistas, bases de datos,
>   catálogos de bibliotecas, editoriales y periódicos.
> • Si la página es una lista de resultados, eliges qué referencias quieres.
> • Ranvier abre tu biblioteca de Mielina y le entrega las referencias. Mielina te muestra qué va a entrar, y nada se
>   guarda sin que lo confirmes.
>
> Necesitas una cuenta en Mielina (mielinapp.com).
>
> Privacidad: Ranvier solo lee la página cuando haces clic, y manda la referencia solo a Mielina. No tiene servidor, no
> guarda tu historial y no lee tus cookies.
>
> Ranvier es software libre (GNU AGPL 3.0). Su código está en github.com/marioesperanzasorto-ops/ranvier.
> Ranvier no es un producto de Zotero ni está respaldado por Zotero. «Zotero» es una marca registrada de la Corporation
> for Digital Scholarship.

**Categoría:** Educación (en Edge: «Education»).

**Idioma:** Español (Latinoamérica).

**Sitio web:** https://github.com/marioesperanzasorto-ops/ranvier

**Política de privacidad (URL):** https://github.com/marioesperanzasorto-ops/ranvier/blob/main/docs/privacidad.md

**Imágenes:**
- Ícono: `tienda/icono-128.png` (128 × 128).
- Capturas (1280 × 800): `tienda/captura-articulo-1280x800.png` y `tienda/captura-lista-1280x800.png`.
- Mosaico pequeño (440 × 280): `tienda/mosaico-440x280.png`.
- Imagen promocional de marquesina (1400 × 560, Chrome): `tienda/marquesina-1400x560.png`.

## Las prácticas de privacidad (Chrome) y las justificaciones de los permisos

**Propósito único:** pasar la referencia de la página que el estudiante está leyendo a su biblioteca de Mielina.

**Justificación de cada permiso:**

- `activeTab`: leer la página que el estudiante tiene abierta, solo cuando hace clic en el botón de Ranvier, para sacar
  los datos de la referencia. Sin ese clic no se lee ninguna página.
- `scripting`: poner en esa página, después del clic, el script que la copia para los traductores y que hace sus
  peticiones al mismo sitio.
- `offscreen`: correr los traductores en un documento fuera de pantalla, dentro de un marco aislado (sandbox), porque el
  service worker no tiene DOM.
- `storage`: guardar, en el almacenamiento de la sesión, la referencia que va a Mielina hasta que Mielina responde (se
  borra al responder o al cerrar el navegador).
- Permiso de sitio `https://mielinapp.com/*`: entregar las referencias en la biblioteca del estudiante en Mielina
  (`/biblioteca`), con `window.postMessage`, y enfocar esa pestaña si ya está abierta.
- `optional_host_permissions` (`http://*/*` y `https://*/*`, opcional): algunas páginas guardan los datos de la
  referencia en otro sitio que no permite leerlos desde la página. Solo entonces Ranvier le pide al estudiante este
  permiso, una sola vez, y solo lo usa para las peticiones de los traductores después de un clic.

**¿Usa código remoto?** No. Todo el código, también el de los traductores de Zotero, va dentro del paquete. Los
traductores se evalúan en un marco aislado (sandbox) del propio paquete.

**Uso de los datos:** marca solo «Contenido del sitio web» (lee la página para sacar la referencia y la manda a
Mielina, que es el servicio del propio estudiante). Ninguna otra categoría. Marca las tres certificaciones: no se venden
ni se transfieren datos a terceros fuera de los usos aprobados; no se usan para nada ajeno al propósito único; no se
usan para evaluar créditos ni préstamos.

## Notas para quien revisa

> Ranvier entrega las referencias a Mielina (mielinapp.com), que pide una cuenta de la Universidad de El Salvador. Para
> probar la lectura sin cuenta: abre la página de un artículo con metadatos (por ejemplo, uno de SciELO) y haz clic en
> Ranvier; se abre mielinapp.com/biblioteca con la referencia lista para que el estudiante la revise. El código y sus
> pruebas (con una Mielina de prueba) están en github.com/marioesperanzasorto-ops/ranvier.

## Cómo publicar

### Chrome Web Store

1. Crea la cuenta de desarrollador en <https://chrome.google.com/webstore/devconsole> con una cuenta de Google. Cuesta
   US$5, una sola vez. Verifica el correo de contacto y declara que no eres comerciante (es gratis y sin anuncios).
2. Corre `npm run paquete` y sube `paquete/ranvier-<versión>.zip` en «Nuevo elemento».
3. Llena «Ficha de Play Store» con los textos y las imágenes de arriba.
4. Llena «Prácticas de privacidad» con lo de arriba.
5. En «Distribución», elige «Pública» (o «No listada» para probar primero con unos pocos estudiantes).
6. Envía a revisión. Suele tardar unos días; el permiso opcional de sitios puede alargarla.

### Microsoft Edge Add-ons

1. Regístrate gratis en el Partner Center, en el programa de Microsoft Edge:
   <https://partner.microsoft.com/dashboard/microsoftedge/overview>.
2. «Crear nueva extensión» y sube el mismo `.zip`.
3. En «Disponibilidad», elige los mercados (o todos).
4. En «Propiedades»: la categoría, la URL de la política de privacidad y el sitio web de arriba.
5. En «Listados», el español, con los textos y las imágenes de arriba.
6. Las notas para la certificación: las de «Notas para quien revisa».
7. Publica. La revisión suele tardar unos días.

### Una versión nueva

1. Sube el número de `version` en `package.json` (por ejemplo, de 1.0.0 a 1.0.1).
2. `npm test` y `npm run paquete`.
3. En cada tienda, sube el `.zip` nuevo en el mismo elemento («Paquete» → «Subir nuevo paquete») y envíalo a revisión.
