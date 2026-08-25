/**
 * Compile le crate `slip39-cli` en WASM et copie le résultat dans les assets Angular.
 *
 * Ce script est appelé automatiquement par les hooks `prestart` / `prebuild` /
 * `pretest` de package.json : le WASM est donc toujours reconstruit à partir des
 * sources Rust, et ne peut pas se désynchroniser de `slip39-core`.
 *
 * Le dossier `src/assets/wasm/slip39/` n'est volontairement pas versionné : le
 * binaire WASM serait un artefact opaque, invérifiable par lecture, dans un projet
 * dont l'argument central est que toute la cryptographie tient dans un module
 * auditable.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crateDir = resolve(projectRoot, '..', 'slip39-workspace', 'crates', 'slip39-cli');
const pkgDir = join(crateDir, 'pkg');
const assetsDir = join(projectRoot, 'src', 'assets', 'wasm', 'slip39');

/** Fichiers produits par wasm-pack réellement nécessaires à l'exécution. */
const ARTIFACTS = [
  'slip39_cli.js',
  'slip39_cli_bg.wasm',
  'slip39_cli.d.ts',
  'slip39_cli_bg.wasm.d.ts',
];

function fail(message, hint) {
  console.error(`\n[build-wasm] ${message}`);
  if (hint) console.error(`[build-wasm] ${hint}\n`);
  process.exit(1);
}

if (!existsSync(crateDir)) {
  fail(
    `Crate introuvable : ${crateDir}`,
    "Le dépôt `slip39-workspace` doit être cloné à côté de `seed-guardian`."
  );
}

console.log('[build-wasm] Compilation du module WASM (slip39-cli)…');

try {
  // On génère dans le `pkg/` du crate plutôt que directement dans les assets :
  // wasm-pack nettoie son dossier de sortie, ce qui effacerait le README qui
  // documente l'emplacement.
  execFileSync(
    'wasm-pack',
    ['build', '--target', 'web', '--out-dir', 'pkg'],
    { cwd: crateDir, stdio: 'inherit', shell: process.platform === 'win32' }
  );
} catch (err) {
  if (err.code === 'ENOENT') {
    fail(
      "`wasm-pack` est introuvable.",
      'Installez-le avec : cargo install wasm-pack (Rust est requis : https://rustup.rs).'
    );
  }
  fail('La compilation WASM a échoué (voir la sortie ci-dessus).');
}

mkdirSync(assetsDir, { recursive: true });

const produced = readdirSync(pkgDir);
let copied = 0;

for (const artifact of ARTIFACTS) {
  if (!produced.includes(artifact)) continue;
  copyFileSync(join(pkgDir, artifact), join(assetsDir, artifact));
  copied++;
}

if (!produced.includes('slip39_cli_bg.wasm') || !produced.includes('slip39_cli.js')) {
  fail(
    'La compilation a réussi mais les fichiers attendus sont absents de pkg/.',
    `Contenu obtenu : ${produced.join(', ') || '(vide)'}`
  );
}

console.log(`[build-wasm] ${copied} fichier(s) copié(s) vers src/assets/wasm/slip39/`);
