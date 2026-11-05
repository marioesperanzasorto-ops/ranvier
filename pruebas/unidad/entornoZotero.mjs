/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * El entorno de Zotero para las pruebas de unidad, en Node: los mismos archivos de zotero/utilities que carga el marco
 * aislado, con los mismos datos (el esquema y los formatos de fecha), como en `vendor/utilities/test/init.js`.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RAIZ } from '../../scripts/compilar.mjs';

const require = createRequire(import.meta.url);
const UTILIDADES = path.join(RAIZ, 'vendor', 'utilities');

export function prepararZotero() {
  if (globalThis.Zotero?.Utilities?.Item) return globalThis.Zotero;
  globalThis.Zotero = { locale: 'en-US', debug: () => {}, isNode: true };
  const Zotero = globalThis.Zotero;
  Zotero.Schema = require(path.join(UTILIDADES, 'schema.js'));
  Zotero.Utilities = require(path.join(UTILIDADES, 'utilities.js'));
  Zotero.Utilities.Item = require(path.join(UTILIDADES, 'utilities_item.js'));
  Zotero.Date = require(path.join(UTILIDADES, 'date.js'));
  const esquema = JSON.parse(readFileSync(path.join(RAIZ, 'vendor', 'zotero-schema', 'schema.json'), 'utf8'));
  // Como en el paquete (`datos/esquemaDeZotero.js`): solo la parte de CSL
  Zotero.Schema.init({ version: esquema.version, csl: esquema.csl });
  Zotero.Date.init(JSON.parse(readFileSync(path.join(UTILIDADES, 'resource', 'dateFormats.json'), 'utf8')));
  const tipos = require(path.join(UTILIDADES, 'cachedTypes.js'));
  tipos.setTypeSchema(require(path.join(UTILIDADES, 'resource', 'zoteroTypeSchemaData.js')));
  Object.assign(Zotero, tipos);
  const collator = new Intl.Collator(['en-US'], { numeric: true, sensitivity: 'base' });
  Zotero.localeCompare = (a, b) => collator.compare(a, b);
  return Zotero;
}
