# El contrato entre el recolector y Mielina (versión 1)

> Este documento es público: se copia en el repositorio de Ranvier. No describe cómo Mielina escribe las referencias
> (eso es privado), solo cómo se le entregan. Los datos de los ejemplos son inventados.

El **recolector** es una extensión del navegador que saca los datos de una referencia de la página que el estudiante está
leyendo. **Mielina** es el editor que las guarda en la biblioteca del estudiante y las escribe en APA. Son dos programas
aparte: no comparten código ni archivos. Solo se pasan datos, con mensajes estándar del navegador y en un formato
público.

El recolector de Mielina es **Ranvier (Mielina)**, con licencia GNU AGPL 3.0:
<https://github.com/marioesperanzasorto-ops/ranvier>. Cualquier otro programa que cumpla este contrato puede mandarle
referencias a Mielina de la misma forma.

## El formato: CSL-JSON

Las referencias van en **CSL-JSON**, el formato de Citation Style Language (especificación 1.0.2, en
<https://github.com/citation-style-language/schema>).
Es una lista de objetos, uno por referencia, con su `type` (`article-journal`, `book`, `chapter`…) y sus variables
(`title`, `author`, `issued`, `container-title`, `DOI`…).

Mielina lee lo que necesita y descarta lo demás. Las marcas de texto (`<i>`, `<span class="nocase">`) se quitan. El
resumen (`abstract`) y las palabras clave (`keyword`) no se guardan.

## El canal: `window.postMessage`, en la pestaña de Mielina

1. El recolector abre (o enfoca) `https://mielinapp.com/biblioteca`. El estudiante debe tener la sesión abierta.
2. El script que la extensión pone en esa página espera este mensaje de la página:

   ```json
   { "tipo": "mielina/lista", "version": 1 }
   ```

3. Entonces le manda las referencias, en la misma ventana y al mismo origen
   (`window.postMessage(mensaje, "https://mielinapp.com")`):

   ```json
   {
     "tipo": "mielina/referencias",
     "version": 1,
     "formato": "csl-json",
     "pagina": "https://revista.ejemplo.edu/articulo/7",
     "referencias": [
       {
         "type": "article-journal",
         "title": "El huerto escolar como laboratorio",
         "container-title": "Revista Inventada de Ciencias",
         "volume": "4",
         "issue": "1",
         "page": "10-22",
         "author": [{ "family": "Campos", "given": "Elena" }],
         "issued": { "date-parts": [[2024]] }
       }
     ]
   }
   ```

4. Mielina le muestra al estudiante qué va a entrar. **Nada se guarda sin que el estudiante lo confirme.** Lo que entra
   llega marcado «por revisar», para que lo compare con la fuente. Al terminar, la página responde:

   ```json
   { "tipo": "mielina/recibidas", "version": 1, "guardadas": 1, "yaEstaban": 0, "omitidas": 0 }
   ```

   Si el estudiante cancela, o si ya había otra ventana abierta, responde:

   ```json
   { "tipo": "mielina/recibidas", "version": 1, "cancelado": true }
   ```

## Lo que Mielina acepta

- Solo mensajes de la misma pestaña y del mismo origen (`https://mielinapp.com`). Los de otro sitio, otra ventana o un
  marco se ignoran.
- `tipo`, `version` y `formato` exactamente como arriba. Un mensaje de otra versión se ignora sin respuesta.
- De 1 a 200 referencias, y como mucho 5 MB de JSON.
- `pagina` es opcional, y solo se guarda si es una dirección `http` o `https`.
- Las referencias que Mielina no escribe se omiten y cuentan en `omitidas`. Por ejemplo, las comunicaciones personales,
  el material legal o un tipo que no reconoce.

## El otro camino: un archivo

El estudiante también puede importar un archivo `.json` con la misma lista de CSL-JSON, en «Importar» en la biblioteca.
Es lo que exporta Zotero con el formato «CSL JSON», y otros gestores de referencias.

## Cambios

Un cambio incompatible sube la `version`. Mielina sigue aceptando la versión 1 mientras haya recolectores que la usen.
