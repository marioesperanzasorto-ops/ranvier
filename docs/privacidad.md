# Privacidad de Ranvier (Mielina)

> Vigente desde el 4 de noviembre de 2026. Esta es la declaración de privacidad de la extensión Ranvier. La de Mielina,
> el editor, está en mielinapp.com.

**En pocas palabras: Ranvier solo lee la página cuando haces clic en su botón, y manda la referencia solo a Mielina.**

## Qué lee Ranvier, y cuándo

- Solo la pestaña que tienes abierta, y solo cuando haces clic en el botón de Ranvier. Antes de ese clic, Ranvier no
  lee ninguna página.
- De esa pestaña lee su dirección y su contenido (el HTML), para encontrar los datos de la referencia: autores, título,
  revista, año, DOI…
- No lee tus cookies, tus contraseñas, tu historial ni otras pestañas.

## Dónde se procesa

En tu computadora, dentro del navegador. Los traductores de Zotero, que reconocen cada sitio, vienen dentro de la
extensión y corren en un marco aislado, sin acceso a tu navegador. Ranvier no tiene servidor: no manda lo que lees a
ningún servidor de Ranvier, ni a Zotero.

## Las peticiones a los sitios que tienen los datos

Algunas páginas no muestran todos los datos de la referencia, y el traductor los pide al sitio que los tiene:

- **Al mismo sitio de la página.** La petición sale desde la página, como si abrieras ese enlace, con tu sesión en ese
  sitio (por ejemplo, la de la biblioteca de tu universidad).
- **A otro sitio** (por ejemplo, una base de datos de DOI). Sale desde la página si ese sitio lo permite. Si no, Ranvier
  te pide un permiso opcional para entrar en otros sitios; se pide una sola vez, y puedes quitarlo cuando quieras en la
  página de extensiones de tu navegador. Aun con ese permiso, Ranvier solo hace estas peticiones cuando haces clic.

Esas peticiones van solo a los sitios que tienen los datos de la referencia, y solo piden esos datos.

## Qué manda, y a quién

- Las referencias que encontró (en CSL-JSON) y la dirección de la página, **solo a Mielina**: a la pestaña de tu
  biblioteca en mielinapp.com, con un mensaje del navegador (`window.postMessage`). No pasa por ningún servidor.
- Mielina te muestra qué va a entrar, y nada se guarda sin que lo confirmes. Lo que Mielina hace con tus referencias
  lo explica su propia política de privacidad.
- Si la página es una lista, solo van las referencias que eliges.

## Qué guarda

- Mientras Mielina no responde, la referencia que va a entrar, en el almacenamiento de la sesión del navegador. Se borra
  cuando Mielina responde, a los 15 minutos o al cerrar el navegador.
- La última respuesta de Mielina (cuántas se guardaron), en el mismo almacenamiento de la sesión.
- Nada más: ni estadísticas, ni identificadores, ni registros de uso.

## Lo que no hace

- No vende ni comparte tus datos.
- No los usa para publicidad, para evaluar créditos ni para nada que no sea pasar la referencia a tu biblioteca.
- No lleva código remoto: todo el código, también el de los traductores, viene dentro de la extensión.

Ranvier cumple la política de Uso limitado de los datos de usuario de la tienda de Chrome Web Store.

## El código

Ranvier es software libre (GNU AGPL 3.0): cualquiera puede revisar qué hace, en
<https://github.com/marioesperanzasorto-ops/ranvier>.

## Cambios

Si esta declaración cambia, la nueva se publica aquí, con su fecha, antes de que el cambio llegue a la extensión.
