/**
 * Publica solo si el CONTENIDO cambio de verdad.
 *
 * picks.json lleva un campo `generado` que cambia en cada corrida, asi
 * que `git diff --quiet` siempre dira que hay cambios y el bot
 * commitearia 24 veces al dia sin que nada haya cambiado de verdad.
 *
 * Se compara la huella semantica (picks, mercados y alertas, sin el
 * timestamp) contra la version que esta en HEAD.
 *
 * Sale con codigo 0 si HAY cambio que publicar, 1 si no.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { huella } from '../engine/movimiento.mjs';
import { fileURLToPath } from 'node:url';

const PICK_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const leer = origen => {
  if (origen === 'disco') {
    return JSON.parse(readFileSync(`${PICK_DIR}picks.json`, 'utf8'));
  }
  return JSON.parse(execSync('git show HEAD:server/public/picks.json', { encoding: 'utf8', maxBuffer: 1e8 }));
};

const nuevo = leer('disco');

let previo = null;
try {
  previo = leer('head');
} catch {
  /* primera corrida: no hay version previa */
}

if (previo && huella(previo) === huella(nuevo)) {
  console.log('sin cambios materiales: no se publica');
  process.exit(1);
}

const cambio = !previo ? 'primera corrida' : 'los picks o las alertas cambiaron';
console.log(`cambio detectado (${cambio})`);
process.exit(0);