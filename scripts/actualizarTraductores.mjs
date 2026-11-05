/*
 * Ranvier (Mielina). Copyright © 2026 Mario Esperanza. Licencia GNU AGPL 3.0 o posterior (LICENSE).
 */

/**
 * Actualiza los traductores de Zotero: mueve el submódulo `vendor/translators` al último commit de
 * zotero/translators (o al que se le pase) y dice qué cambió. Los traductores siempre van dentro del paquete, en un
 * commit fijo: Ranvier no los baja de internet mientras funciona.
 *
 *   npm run traductores:actualizar              → al último commit de la rama master
 *   npm run traductores:actualizar -- <commit>  → a ese commit
 *
 * Después: `npm test`, y si todo pasa, hacer commit del submódulo («Traductores de Zotero al <fecha>»).
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { RAIZ, leerTraductores } from './compilar.mjs';

const CARPETA = path.join(RAIZ, 'vendor', 'translators');
const git = (...args) => execFileSync('git', ['-C', CARPETA, ...args], { encoding: 'utf8' }).trim();

const pedido = process.argv[2];
if (pedido && !/^[0-9a-f]{7,40}$/i.test(pedido)) {
  console.error('El commit debe ser un hash de git (por ejemplo, 9d04f4b8).');
  process.exit(1);
}

const antes = git('rev-parse', 'HEAD');
const cuantosAntes = (await leerTraductores()).length;
git('fetch', '--quiet', 'origin', 'master');
const destino = pedido ? git('rev-parse', '--verify', `${pedido}^{commit}`) : git('rev-parse', 'origin/master');
git('checkout', '--quiet', destino);
const cuantosDespues = (await leerTraductores()).length;

if (antes === destino) {
  console.log(`Los traductores ya estaban en ${destino.slice(0, 8)}.`);
} else {
  const cambios = git('diff', '--shortstat', antes, destino);
  console.log(`Traductores: ${antes.slice(0, 8)} → ${destino.slice(0, 8)} (${git('log', '-1', '--format=%cd', '--date=short', destino)})`);
  console.log(`${cambios}. Traductores en el paquete: ${cuantosAntes} → ${cuantosDespues}.`);
  console.log('Ahora corre «npm test» y, si todo pasa, haz commit de vendor/translators.');
}
