# Seed Guardian

Application de découpage et de reconstruction de seed de wallet crypto selon le standard **SLIP-39** (Shamir's Secret Sharing, Trezor/SatoshiLabs).

Elle permet de transformer une phrase de récupération BIP-39 (12 à 24 mots) en *N* fragments dont *M* suffisent à la reconstituer — de sorte qu'aucun fragment pris isolément ne révèle quoi que ce soit du secret, et que la perte de quelques fragments ne soit pas fatale.

> ⚠️ **Ce code n'a reçu aucun audit de sécurité externe.** Ne l'utilisez pas pour protéger de vrais fonds avant audit. Voir [Sécurité](#sécurité).

---

## Architecture

Le projet est réparti sur deux dépôts GitHub complémentaires :

| Dépôt | Dossier local attendu | Rôle |
|---|---|---|
| [clement3399/slip39-core](https://github.com/clement3399/slip39-core) | `slip39-workspace/` | Le cœur cryptographique en Rust (`slip39-core`) + les bindings WASM (`slip39-cli`). |
| [clement3399/seed_guardian](https://github.com/clement3399/seed_guardian) | `seed-guardian/` | Le front Angular 18 qui consomme le WASM et fournit l'interface. |

> **Attention au nom du dossier.** Le dépôt du cœur s'appelle `slip39-core` sur GitHub, mais [scripts/build-wasm.mjs](scripts/build-wasm.mjs) le cherche sous le nom `slip39-workspace`. Clonez-le donc en renommant le dossier de destination (voir [Installation](#récupérer-les-deux-dépôts)).

Toute la logique cryptographique vit dans `slip39-core`, sans aucune dépendance à une cible de déploiement. Le front n'implémente **aucune** primitive cryptographique : il se contente d'appeler le module WASM. C'est ce découpage qui garantit qu'un audit de sécurité ne porte que sur un seul module.

```
Angular (UI)  ──►  slip39_cli.js (bindings wasm-bindgen)  ──►  slip39-core (Rust)
     │
     └──►  @scure/bip39  (validation + conversion des phrases BIP-39)
```

### Fonctionnement de bout en bout

1. L'utilisateur saisit une phrase BIP-39 (ou une entropie hexadécimale brute).
2. `Bip39Service` valide la wordlist **et** le checksum, puis convertit la phrase en entropie.
3. `Slip39Service` transmet cette entropie au WASM, qui la découpe en *N* fragments SLIP-39.
4. `QrService` génère un QR code par fragment, pour impression et stockage hors ligne.

La reconstruction suit le chemin inverse : *M* fragments → entropie → phrase BIP-39 d'origine.

---

## Tout fonctionne hors ligne

L'application ne fait **aucune requête réseau** une fois chargée : pas d'appel API, pas de télémétrie, pas de CDN. Le secret ne quitte jamais la mémoire de l'application.

C'est une propriété de sécurité essentielle, et elle est vérifiable : ouvrez l'onglet Réseau des outils de développement pendant une génération — aucune requête sortante ne doit apparaître.

Dans l'exécutable Windows, ce n'est pas qu'une affaire de discipline : la politique de sécurité de contenu **interdit structurellement** toute connexion sortante (voir [PACKAGING-WINDOWS.md](PACKAGING-WINDOWS.md#verrouillage-réseau)).

Pour un usage réel, la manipulation devrait se faire sur une machine déconnectée du réseau (voir [Sécurité](#sécurité)).

---

## Prérequis

- **Node.js** 18.19+ (ou 20+) et npm.
- **Rust** (via [rustup](https://rustup.rs/)).
- **wasm-pack** : `cargo install wasm-pack`.

Rust et `wasm-pack` sont nécessaires même pour un simple lancement : le module WASM est recompilé depuis les sources à chaque démarrage (voir ci-dessous).

Les deux dépôts doivent être clonés **côte à côte** — `seed-guardian/` s'attend à trouver `slip39-workspace/` dans le même dossier parent.

---

## Installation et lancement

### Récupérer les deux dépôts

Le cœur cryptographique vit dans un dépôt distinct. Clonez-le **en le renommant** `slip39-workspace` : c'est le nom sous lequel le script de compilation du WASM le cherche.

```bash
mkdir coffre-seed && cd coffre-seed
git clone https://github.com/clement3399/slip39-core.git slip39-workspace
git clone https://github.com/clement3399/seed_guardian.git seed-guardian
```

Vous devez obtenir cette disposition :

```
coffre-seed/
├── slip39-workspace/   ← le cœur Rust (dépôt slip39-core)
└── seed-guardian/      ← ce dépôt
```

Sans ce voisinage, `npm start` et `npm run build` échouent avec le message : *« Le dépôt `slip39-workspace` doit être cloné à côté de `seed-guardian`. »*

### En application Windows (recommandé)

```bash
cd seed-guardian
npm install
npm run tauri:build
```

Produit `src-tauri/target/release/seed-guardian.exe` (3,1 Mo), à double-cliquer — ainsi que deux installeurs. Voir [PACKAGING-WINDOWS.md](PACKAGING-WINDOWS.md) pour le détail.

C'est le mode d'usage à privilégier pour manipuler une seed réelle : l'application embarque son propre moteur de rendu, isolé du navigateur quotidien et des extensions qui y sont installées — lesquelles peuvent lire le contenu des pages.

Pour développer avec rechargement à chaud : `npm run tauri:dev`.

### Dans le navigateur

```bash
npm start
```

L'application est alors disponible sur <http://localhost:4200>.

### Compilation du module WASM

Elle est **automatique**. Les scripts `start`, `build`, `watch` et `test` sont précédés d'un hook npm qui exécute [scripts/build-wasm.mjs](scripts/build-wasm.mjs) : celui-ci compile `slip39-cli` en WASM et copie le résultat dans `src/assets/wasm/slip39/`.

Pour le régénérer seul :

```bash
npm run wasm
```

Le dossier `src/assets/wasm/slip39/` **n'est pas versionné**, et c'est délibéré. Un binaire WASM commité serait un artefact opaque : personne ne peut vérifier par lecture qu'il correspond bien au `slip39-core` audité. Dans un projet dont l'argument central est que toute la cryptographie tient dans un module auditable, livrer un blob invérifiable contredirait la promesse. Le recompiler systématiquement garantit en outre qu'il ne peut jamais se désynchroniser des sources Rust.

Le service Angular charge ce module via une URL construite à l'exécution plutôt qu'un import statique : cela empêche esbuild de tenter de le bundler au build, et le laisse servi comme simple asset.

---

## Vérifier l'intégrité de l'exécutable

Une application qui manipule des seeds est une cible de choix pour la substitution : une copie modifiée — même interface, générateur d'aléa affaibli — produirait des fragments prédictibles sans que rien ne le laisse voir. Avant de confier une seed réelle à un binaire, assurez-vous qu'il s'agit bien de l'original.

### Si le binaire est signé

```powershell
Get-AuthenticodeSignature .\seed-guardian.exe | Format-List Status, SignerCertificate
```

`Status` doit valoir `Valid`, et le signataire correspondre à l'éditeur attendu.

### Si le binaire n'est pas signé — cas actuel

Les binaires **ne sont pas encore signés** (voir [SIGNATURE.md](SIGNATURE.md)). Windows affichera donc « Éditeur inconnu » au lancement.

Comparez alors l'empreinte SHA-256 du fichier téléchargé à celle publiée par l'éditeur :

```powershell
Get-FileHash .\seed-guardian.exe -Algorithm SHA256
```

Cette vérification n'a de valeur que si l'empreinte de référence provient d'une **source distincte** du binaire lui-même : qui peut remplacer l'un peut remplacer l'autre.

### La méthode la plus sûre : compiler soi-même

La compilation est reproductible depuis les sources. Plutôt que de faire confiance à un binaire distribué, construisez-le :

```bash
npm install
npm run tauri:build
```

L'exécutable produit est alors issu du code que vous pouvez lire — ce qui évacue entièrement la question de la confiance.

---

## Tests

### Cœur cryptographique (Rust)

Ces tests vivent dans le dépôt [slip39-core](https://github.com/clement3399/slip39-core), cloné en `slip39-workspace/` :

```bash
cd ../slip39-workspace
cargo test
```

La suite couvre 6 tests unitaires (arithmétique GF(256), découpage/reconstruction, détection de fragment corrompu, wordlist) **et les 45 vecteurs de test officiels** publiés par Trezor/SatoshiLabs. C'est cette dernière suite qui atteste la conformité au standard : elle doit passer à 100 % avant tout usage en production.

### Front (Angular)

```bash
cd seed-guardian
npm test
```

---

## Utilisation

### Découper une seed

1. Onglet **Découper**, choisir le mode de saisie (phrase de 12–24 mots, ou hexadécimal).
2. Saisir la phrase de récupération. La validation signale en direct un mot mal orthographié, un nombre de mots invalide ou un checksum incorrect.
3. Régler le seuil *M*-sur-*N* (par exemple 3 fragments requis sur 5 générés).
4. **Générer**, puis **Imprimer** — chaque fragment est mis en page avec son QR code.

### Reconstruire une seed

1. Onglet **Reconstruire**.
2. Saisir au moins *M* fragments (un par champ).
3. **Reconstruire** : l'application affiche l'entropie et, si sa longueur correspond à un format standard, la phrase BIP-39 d'origine.

### Choisir son seuil

Le seuil est un arbitrage entre deux risques opposés : le vol et la perte.

- Un seuil **bas** (2-sur-5) résiste bien à la perte, mais un attaquant n'a besoin que de deux fragments.
- Un seuil **élevé** (4-sur-5) résiste bien au vol, mais deux fragments perdus rendent la seed irrécupérable.

3-sur-5 est un compromis courant. Surtout, les fragments doivent être stockés dans des lieux **réellement distincts** : cinq fragments dans le même tiroir n'offrent pas plus de sécurité qu'une seed écrite en clair.

---

## Sécurité

### Statut

Le module cryptographique est une transposition fidèle de l'implémentation de référence `python-shamir-mnemonic`, validée contre ses vecteurs officiels. Cela atteste de sa **conformité fonctionnelle**, pas de sa résistance à un attaquant.

### Limites connues

Ces points sont des travaux restants, pas des détails :

- **Aucun audit externe** n'a été réalisé.
- **Pas d'effacement mémoire** : les secrets ne sont pas enveloppés dans des types `Zeroize`. Ils subsistent en mémoire après usage, et peuvent atterrir dans un fichier d'échange (swap) ou un dump de crash.
- **Pas de garantie de temps constant** : aucune protection contre les attaques par canal auxiliaire n'a été ajoutée (le crate `subtle` serait le point de départ).

### Choix assumé : pas de passphrase

SLIP-39 prévoit de chiffrer le secret par une passphrase avant de le fragmenter. `slip39-core` implémente ce chiffrement et le valide contre les vecteurs officiels, mais **l'application ne l'expose délibérément pas** : les bindings appellent le cœur avec une passphrase vide.

La fragmentation constitue à elle seule le mécanisme de sécurité : reconstruire la seed exige de réunir *M* fragments stockés en des lieux distincts. Une passphrase n'éliminerait pas ce risque, elle en ajouterait un second — l'oubli — dont les conséquences sont identiques à celles du vol : la perte définitive des fonds. Sur un horizon de plusieurs années, ou dans un scénario de succession où l'héritier détient les fragments mais ignore la passphrase, ce risque est le plus probable des deux.

Ajouter un secret unique à mémoriser à un outil conçu pour supprimer la dépendance à un secret unique reviendrait à reprendre d'une main ce que l'on donne de l'autre.

**Ce que cela implique** : la sécurité repose entièrement sur la dissimulation physique des fragments. Ils doivent être stockés dans des lieux réellement distincts et distinctement protégés — quiconque réunit *M* fragments reconstruit la seed, sans autre obstacle.

### Précautions d'usage

- Manipuler une seed réelle uniquement sur une **machine déconnectée du réseau**, idéalement depuis un système live démarré sur clé USB.
- Imprimer sur une imprimante **locale, non connectée** — beaucoup d'imprimantes réseau conservent un cache des documents.
- Vérifier la reconstruction **avant** de se reposer sur les fragments : générez, puis reconstruisez immédiatement avec *M* fragments et comparez à la phrase d'origine.
- Ne jamais photographier ni stocker un fragment sur un appareil connecté (cloud, sauvegarde automatique).

---

## Feuille de route

- [x] **P1** — cœur SLIP-39 en Rust, validé contre les vecteurs officiels.
- [x] **P2** — bindings WASM et interface Angular (découpage, reconstruction, QR codes, impression).
- [x] **P3** — packaging en exécutable Windows autonome via Tauri 2 (voir [PACKAGING-WINDOWS.md](PACKAGING-WINDOWS.md)).
- [ ] Signature du binaire — configuration prête, certificat à obtenir (voir [SIGNATURE.md](SIGNATURE.md)).
- [ ] Support de la hiérarchie multi-groupes (le cœur la gère déjà, l'UI la limite à un seul groupe).
- [ ] Effacement mémoire (`zeroize`) et opérations à temps constant (`subtle`).
- [ ] Audit de sécurité externe.

---

## Licence

À définir.
