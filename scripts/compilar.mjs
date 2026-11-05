/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Compila la extensión en una carpeta lista para cargar en Chrome o Edge (o para empaquetar):
 * - copia `src/`;
 * - copia de los submódulos de Zotero, sin cambiarlos, lo que necesita el marco aislado (`vendor/translate` y
 *   `vendor/utilities`, en `zotero/`), con sus licencias;
 * - copia los traductores de `vendor/translators` (en un commit fijo) a `traductores/<id>.js`, sin cambiarlos, y
 *   escribe su índice (`traductores/indice.json`, solo sus datos);
 * - escribe los datos que necesita la conversión (`datos/`: el esquema de `vendor/zotero-schema` y los formatos de
 *   fecha de `vendor/utilities`);
 * - escribe el manifiesto con la versión de `package.json`.
 *
 *   node scripts/compilar.mjs                      → dist/, para las tiendas (solo https://mielinapp.com)
 *   node scripts/compilar.mjs --desarrollo         → dist-desarrollo/, también con la Mielina de desarrollo
 *   --mielina=http://localhost:3000                → la Mielina de desarrollo (por omisión, esa)
 *   --salida=carpeta                               → otra carpeta
 */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(RAIZ, 'vendor');
const MIELINA = 'https://mielinapp.com';
const MIELINA_DE_DESARROLLO = 'http://localhost:3000';

/** Los archivos de zotero/translate que carga el marco aislado (sin `repo.js`: Ranvier no usa repo.zotero.org). */
export const DE_TRANSLATE = [
  'zotero.js', 'promise.js', 'utilities_translate.js', 'debug.js', 'http.js', 'translator.js', 'translators.js',
  'translation/translate.js', 'translation/sandboxManager.js', 'translation/translate_item.js', 'tlds.js', 'proxy.js',
  'rdf/init.js', 'rdf/uri.js', 'rdf/term.js', 'rdf/identity.js', 'rdf/n3parser.js', 'rdf/rdfparser.js', 'rdf/serialize.js',
];
/** Los de zotero/utilities. */
export const DE_UTILITIES = [
  'openurl.js', 'date.js', 'xregexp-all.js', 'xregexp-unicode-zotero.js', 'utilities.js', 'utilities_item.js',
  'schema.js', 'resource/zoteroTypeSchemaData.js', 'cachedTypes.js',
];

/** Los datos del comienzo de un traductor (el mismo patrón de `Zotero.Repo.infoRe`). */
const DATOS_DEL_TRADUCTOR = /^\s*{[\S\s]*?}\s*?[\r\n]/;
const TIPO_EXPORTAR = 2;

function commitDe(carpeta) {
  try {
    return execFileSync('git', ['-C', carpeta, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'desconocido';
  }
}

/** Los traductores del submódulo: sus datos y su archivo. Se dejan fuera los que solo exportan. */
export async function leerTraductores(carpeta = path.join(VENDOR, 'translators')) {
  const traductores = [];
  for (const nombre of (await readdir(carpeta)).sort()) {
    if (!nombre.endsWith('.js')) continue;
    const archivo = path.join(carpeta, nombre);
    const codigo = await readFile(archivo, 'utf8');
    const datos = DATOS_DEL_TRADUCTOR.exec(codigo);
    if (!datos) continue;
    let info;
    try {
      info = JSON.parse(datos[0]);
    } catch {
      continue;
    }
    if (!info.translatorID || typeof info.translatorType !== 'number') continue;
    if (info.translatorType === TIPO_EXPORTAR) continue;
    traductores.push({ info, archivo, nombre });
  }
  return traductores;
}

function leerOpciones(argv) {
  const opciones = {};
  for (const arg of argv) {
    if (arg === '--desarrollo') opciones.desarrollo = true;
    else if (arg.startsWith('--mielina=')) opciones.mielina = arg.slice('--mielina='.length);
    else if (arg.startsWith('--salida=')) opciones.salida = arg.slice('--salida='.length);
    else throw new Error(`No conozco la opción ${arg}`);
  }
  return opciones;
}

function origenValido(origen) {
  const url = new URL(origen);
  if (url.origin !== origen) throw new Error(`«${origen}» no es un origen (por ejemplo, http://localhost:3000)`);
  return origen;
}

/**
 * Compila la extensión.
 * @param {{ desarrollo?: boolean, mielina?: string, salida?: string }} [opciones]
 * @returns {Promise<string>} La carpeta.
 */
export async function compilar({ desarrollo = false, mielina, salida } = {}) {
  const deDesarrollo = desarrollo ? origenValido(mielina || MIELINA_DE_DESARROLLO) : null;
  const carpeta = path.resolve(RAIZ, salida || (desarrollo ? 'dist-desarrollo' : 'dist'));
  await rm(carpeta, { recursive: true, force: true });
  await mkdir(carpeta, { recursive: true });

  // El código de Ranvier
  await cp(path.join(RAIZ, 'src'), carpeta, { recursive: true });

  // Zotero: la arquitectura de traducción y sus utilidades, sin cambios
  for (const [modulo, archivos, raiz] of [['translate', DE_TRANSLATE, 'src'], ['utilities', DE_UTILITIES, '']]) {
    for (const archivo of archivos) {
      const destino = path.join(carpeta, 'zotero', modulo, archivo);
      await mkdir(path.dirname(destino), { recursive: true });
      await cp(path.join(VENDOR, modulo, raiz, archivo), destino);
    }
    await cp(path.join(VENDOR, modulo, 'COPYING'), path.join(carpeta, 'zotero', modulo, 'COPYING'));
  }

  // Los traductores, sin cambios, y su índice
  const traductores = await leerTraductores();
  await mkdir(path.join(carpeta, 'traductores'), { recursive: true });
  for (const { info, archivo } of traductores) {
    await cp(archivo, path.join(carpeta, 'traductores', `${info.translatorID}.js`));
  }
  const commitDeTraductores = commitDe(path.join(VENDOR, 'translators'));
  await writeFile(path.join(carpeta, 'traductores', 'indice.json'), JSON.stringify({
    origen: `https://github.com/zotero/translators/tree/${commitDeTraductores}`,
    commit: commitDeTraductores,
    traductores: traductores.map(({ info, nombre }) => ({ ...info, archivo: nombre })),
  }));

  // Los datos de Zotero que necesita la conversión
  const esquema = JSON.parse(await readFile(path.join(VENDOR, 'zotero-schema', 'schema.json'), 'utf8'));
  const formatos = JSON.parse(await readFile(path.join(VENDOR, 'utilities', 'resource', 'dateFormats.json'), 'utf8'));
  await mkdir(path.join(carpeta, 'datos'), { recursive: true });
  const aviso = (de, commit) => `// Generado por scripts/compilar.mjs desde ${de} (commit ${commit}). Datos de Zotero, con la licencia GNU AGPL 3.0.\n`;
  await writeFile(
    path.join(carpeta, 'datos', 'esquemaDeZotero.js'),
    `${aviso('zotero/zotero-schema, schema.json, solo `csl`', commitDe(path.join(VENDOR, 'zotero-schema')))}globalThis.RANVIER_ESQUEMA_DE_ZOTERO = ${JSON.stringify({ version: esquema.version, csl: esquema.csl })};\n`,
  );
  await writeFile(
    path.join(carpeta, 'datos', 'formatosDeFecha.js'),
    `${aviso('zotero/utilities, resource/dateFormats.json', commitDe(path.join(VENDOR, 'utilities')))}globalThis.RANVIER_FORMATOS_DE_FECHA = ${JSON.stringify(formatos)};\n`,
  );

  // El manifiesto y la configuración
  const paquete = JSON.parse(await readFile(path.join(RAIZ, 'package.json'), 'utf8'));
  const manifiesto = JSON.parse(await readFile(path.join(RAIZ, 'src', 'manifest.json'), 'utf8'));
  manifiesto.version = paquete.version;
  if (deDesarrollo) {
    manifiesto.name = `${manifiesto.name} — desarrollo`;
    manifiesto.host_permissions.push(`${deDesarrollo}/*`);
    manifiesto.content_scripts[0].matches.push(`${deDesarrollo}/biblioteca*`);
    const config = await readFile(path.join(RAIZ, 'src', 'comun', 'config.js'), 'utf8');
    await writeFile(path.join(carpeta, 'comun', 'config.js'), config
      .replace(`export const MIELINA = '${MIELINA}';`, `export const MIELINA = '${deDesarrollo}';`)
      .replace(`export const MIELINAS = ['${MIELINA}'];`, `export const MIELINAS = ['${deDesarrollo}', '${MIELINA}'];`));
  }
  await writeFile(path.join(carpeta, 'manifest.json'), `${JSON.stringify(manifiesto, null, 2)}\n`);

  // La licencia y los avisos van en el paquete
  for (const archivo of ['LICENSE', 'NOTICE']) await cp(path.join(RAIZ, archivo), path.join(carpeta, archivo));

  return carpeta;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opciones = leerOpciones(process.argv.slice(2));
  const carpeta = await compilar(opciones);
  console.log(`Ranvier compilado en ${path.relative(RAIZ, carpeta) || carpeta}`);
}
