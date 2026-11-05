/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 *
 * La conversión a CSL-JSON (`src/comun/cslJson.js`), con la de Zotero y los mismos datos que van en el paquete. Lo que
 * sale es lo que recibe Mielina (`docs/contrato-del-recolector.md`). Los datos son inventados.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { prepararZotero } from './entornoZotero.mjs';

prepararZotero();
await import('../../src/comun/cslJson.js');
const { aCslJson, elementoACslJson } = globalThis.RanvierCsl;

const AHORA = new Date('2026-11-05T15:00:00Z');

test('un artículo de revista: tipo, autores, revista, fecha, páginas y DOI', () => {
  const [csl] = aCslJson([{
    itemType: 'journalArticle',
    title: 'El huerto escolar como laboratorio',
    creators: [
      { firstName: 'Elena', lastName: 'Campos', creatorType: 'author' },
      { firstName: 'Tomás', lastName: 'Rivas Quintanilla', creatorType: 'author' },
    ],
    publicationTitle: 'Revista Inventada de Ciencias',
    volume: '4',
    issue: '1',
    pages: '10-22',
    date: '2024-03-15',
    DOI: '10.99999/inventado.2024.7',
    url: 'https://revista.ejemplo.edu/articulo/7',
    language: 'es',
    tags: [{ tag: 'huertos' }],
    notes: [{ note: 'una nota' }],
    attachments: [{ title: 'PDF', url: 'https://revista.ejemplo.edu/articulo/7.pdf' }],
  }], AHORA);
  assert.deepEqual(csl, {
    type: 'article-journal',
    title: 'El huerto escolar como laboratorio',
    'container-title': 'Revista Inventada de Ciencias',
    volume: '4',
    issue: '1',
    page: '10-22',
    DOI: '10.99999/inventado.2024.7',
    URL: 'https://revista.ejemplo.edu/articulo/7',
    language: 'es',
    author: [
      { family: 'Campos', given: 'Elena' },
      { family: 'Rivas Quintanilla', given: 'Tomás' },
    ],
    issued: { 'date-parts': [['2024', 3, 15]] },
  });
});

test('un libro: editorial, lugar, edición, solo el primer ISBN y los editores', () => {
  const csl = elementoACslJson({
    itemType: 'book',
    title: 'Historia de un pueblo que no existe',
    creators: [
      { firstName: 'Julio', lastName: 'Herrera', creatorType: 'author' },
      { firstName: 'Rosa', lastName: 'Linares', creatorType: 'editor' },
    ],
    publisher: 'Editorial Ficticia',
    place: 'San Miguel',
    edition: '2',
    ISBN: '978-0-00-000000-2 978-0-00-000001-9',
    date: '2018',
  }, AHORA);
  assert.equal(csl.type, 'book');
  assert.equal(csl.publisher, 'Editorial Ficticia');
  assert.equal(csl['publisher-place'], 'San Miguel');
  assert.equal(csl.edition, '2');
  assert.equal(csl.ISBN, '978-0-00-000000-2');
  assert.deepEqual(csl.author, [{ family: 'Herrera', given: 'Julio' }]);
  assert.deepEqual(csl.editor, [{ family: 'Linares', given: 'Rosa' }]);
  assert.deepEqual(csl.issued, { 'date-parts': [['2018']] });
});

test('un autor institucional (un solo campo) va como literal', () => {
  const csl = elementoACslJson({
    itemType: 'report',
    title: 'Informe inventado sobre el agua',
    creators: [{ lastName: 'Ministerio Inventado del Agua', fieldMode: 1, creatorType: 'author' }],
    institution: 'Ministerio Inventado del Agua',
    date: '2022',
  }, AHORA);
  assert.equal(csl.type, 'report');
  assert.deepEqual(csl.author, [{ literal: 'Ministerio Inventado del Agua' }]);
  assert.equal(csl.publisher, 'Ministerio Inventado del Agua');
});

test('la fecha de consulta: CURRENT_TIMESTAMP es la hora de la lectura', () => {
  const csl = elementoACslJson({ itemType: 'webpage', title: 'Una página', url: 'https://ejemplo.edu/p', accessDate: 'CURRENT_TIMESTAMP' }, AHORA);
  const [anio, mes] = csl.accessed['date-parts'][0];
  assert.equal(String(anio), '2026');
  assert.equal(mes, 11);
});

test('una fecha de consulta que no se entiende no deja un «accessed» vacío', () => {
  const csl = elementoACslJson({ itemType: 'webpage', title: 'Una página', accessDate: 'mañana' }, AHORA);
  assert.equal(csl.accessed?.literal === '', false);
});

test('sin lo vacío y sin «id» (no hay biblioteca de Zotero)', () => {
  const csl = elementoACslJson({ itemType: 'journalArticle', title: 'Solo el título', volume: '', issue: '  ', creators: [] }, AHORA);
  assert.deepEqual(csl, { type: 'article-journal', title: 'Solo el título' });
  assert.equal('id' in csl, false);
});

test('las notas, los adjuntos y los tipos desconocidos no son referencias', () => {
  const referencias = aCslJson([
    { itemType: 'note', note: 'Una nota' },
    { itemType: 'attachment', title: 'Un PDF' },
    { itemType: 'tipoQueNoExiste', title: 'Raro' },
    null,
    { itemType: 'book', title: 'Un libro inventado' },
  ], AHORA);
  assert.deepEqual(referencias, [{ type: 'book', title: 'Un libro inventado' }]);
});

test('el orden de la lista se mantiene', () => {
  const referencias = aCslJson([
    { itemType: 'book', title: 'Primero' },
    { itemType: 'journalArticle', title: 'Segundo' },
    { itemType: 'thesis', title: 'Tercero', university: 'Universidad Inventada' },
  ], AHORA);
  assert.deepEqual(referencias.map((r) => r.title), ['Primero', 'Segundo', 'Tercero']);
  assert.deepEqual(referencias.map((r) => r.type), ['book', 'article-journal', 'thesis']);
});

test('lo que sale es JSON puro: se puede mandar con postMessage y con JSON.stringify', () => {
  const referencias = aCslJson([{
    itemType: 'journalArticle',
    title: 'Las abejas nativas del bosque seco',
    creators: [{ firstName: 'Marisol', lastName: 'Ortiz', creatorType: 'author' }],
    date: '2021',
  }], AHORA);
  assert.deepEqual(JSON.parse(JSON.stringify(referencias)), referencias);
  assert.deepEqual(structuredClone(referencias), referencias);
});
