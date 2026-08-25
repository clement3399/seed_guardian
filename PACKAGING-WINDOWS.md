# Packaging en exécutable Windows

Seed Guardian est empaquetée avec **Tauri 2** en application Windows autonome : un `.exe` à double-cliquer, sans installation de Node.js ni navigateur à ouvrir.

**C'est en place et fonctionnel.** Ce document décrit le fonctionnement, les décisions prises, et les points restants avant une distribution publique.

---

## Livrables

```bash
npm run tauri:build
```

Produit trois fichiers dans `src-tauri/target/release/` :

| Livrable | Taille | Usage |
|---|---|---|
| `seed-guardian.exe` | 3,1 Mo | Exécutable autonome, à double-cliquer — aucune installation |
| `bundle/nsis/Seed Guardian_0.1.0_x64-setup.exe` | 1,2 Mo | Installeur classique (menu Démarrer, désinstallation) |
| `bundle/msi/Seed Guardian_0.1.0_x64_en-US.msi` | 1,7 Mo | Installeur MSI, pour déploiement en entreprise |

À titre de comparaison, le même périmètre sous Electron produirait un binaire d'environ 130 Mo.

Pour développer avec rechargement à chaud : `npm run tauri:dev`.

---

## Pourquoi Tauri plutôt qu'Electron

| | **Tauri** (retenu) | Electron |
|---|---|---|
| Taille du binaire | ~3 Mo | ~130 Mo |
| Moteur de rendu | WebView2 (fourni par Windows) | Chromium embarqué |
| Surface d'attaque | réduite | large (Chromium + Node complets) |
| Chaîne de build | Rust + Node | Node seul |

Trois raisons, dans l'ordre d'importance :

1. **Rust est déjà dans le projet.** Le cœur cryptographique est en Rust ; Tauri n'ajoute donc pas une technologie de plus, il réutilise celle qui est déjà là.
2. **Surface d'attaque réduite.** Electron embarque Chromium *et* un runtime Node complet avec accès disque et réseau. Pour une application qui doit pouvoir démontrer qu'elle ne fait rien d'autre que du calcul local, c'est beaucoup de code impossible à justifier.
3. **Un chemin vers la suppression du WASM** (voir la dernière section).

Electron resterait défendable pour cibler des Windows anciens sans WebView2. Ce n'est pas le cas ici : WebView2 est préinstallé sur Windows 10 et 11 à jour.

### Le gain de sécurité, au-delà du confort

Sans exécutable, la seed est saisie dans le navigateur quotidien de l'utilisateur — celui qui héberge ses extensions, dont certaines peuvent lire le contenu des pages. L'exécutable embarque un moteur de rendu isolé : aucune extension, aucun onglet tiers, aucune synchronisation cloud.

---

## Prérequis de compilation

- **Rust** (déjà nécessaire pour `slip39-workspace`).
- **Microsoft C++ Build Tools** — via [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), composant « Développement Desktop en C++ ». Une installation Visual Studio Community avec ce composant convient également.
- **WebView2** — préinstallé sur Windows 10/11 à jour.

L'utilisateur final n'a besoin d'aucun de ces prérequis : seulement de WebView2.

---

## Structure

```
seed-guardian/
├── src-tauri/
│   ├── Cargo.toml           # dépendances de la coquille + profil release
│   ├── build.rs
│   ├── tauri.conf.json      # configuration : fenêtre, CSP, bundles
│   ├── icons/               # icônes générées (npx tauri icon)
│   └── src/
│       ├── main.rs          # point d'entrée ; masque la console en release
│       └── lib.rs           # ouvre la fenêtre — aucune logique métier
└── dist/seed-guardian/browser/   # front Angular compilé, embarqué au build
```

La coquille Rust ne contient **aucune** logique cryptographique : elle se limite à afficher le front. Toute la cryptographie reste dans `slip39-core`, ce qui préserve le périmètre d'audit.

---

## Trois pièges résolus

Les deux premiers cassent le chargement en `file://` et se manifestent par une **fenêtre blanche sans message d'erreur** ; le troisième par une page **affichée mais sans aucun style**. Tous sont corrigés, mais méritent d'être connus en cas de régression.

### 1. Le `base href`

Le build Angular génère `<base href="/">`. En mode serveur, `/` désigne la racine du serveur web ; dans l'exécutable, les fichiers viennent du disque et `/` pointe vers la racine du système.

Corrigé par le script `build:tauri`, qui compile avec `--base-href ./`. C'est ce script que `tauri.conf.json` appelle via `beforeBuildCommand`.

> **Attention au hook WASM.** npm ne déclenche `prebuild` que pour un script nommé exactement `build`. Le script personnalisé `build:tauri` a donc son propre `prebuild:tauri` — sans quoi l'exécutable serait construit avec un WASM potentiellement périmé, précisément le problème que l'automatisation du build cherche à éliminer.

### 2. Le chemin de chargement du WASM

`Slip39Service` chargeait le module via le chemin absolu `/assets/wasm/slip39/slip39_cli.js`, qui échoue pour la même raison. Il est désormais relatif (`./assets/...`) dans [src/app/services/slip39.service.ts](src/app/services/slip39.service.ts#L29) — ce qui reste correct en `ng serve`, la page étant servie à la racine.

Le WASM lui-même est embarqué automatiquement : `angular.json` copie `src/assets` dans le build, et le hook `prebuild:tauri` le recompile au préalable.

### 3. L'inlining du CSS critique, incompatible avec la CSP

Symptôme : l'application s'affiche et fonctionne (les QR codes sont générés), mais **sans aucun style** — du HTML brut.

En production, Angular applique par défaut une optimisation dite *critters* : il inline le CSS critique dans `<head>` et diffère le reste avec un artifice :

```html
<link rel="stylesheet" href="styles.css" media="print" onload="this.media='all'">
```

La feuille est chargée en `media="print"` — donc invisible à l'écran — puis basculée sur `all` par le gestionnaire `onload`. Or **la CSP bloque les gestionnaires d'événements inline**, et l'autoriser exigerait `'unsafe-inline'` sur `script-src`, ce qui reviendrait à ouvrir l'exécution de scripts arbitraires. Inacceptable pour cette application.

La feuille reste donc éternellement en `media="print"` : le style ne s'applique jamais.

Corrigé dans [angular.json](angular.json) en désactivant cette seule optimisation, les autres (minification des scripts et des styles) étant conservées :

```json
"optimization": {
  "scripts": true,
  "fonts": true,
  "styles": { "minify": true, "removeSpecialComments": true, "inlineCritical": false }
}
```

Le `<link>` est alors émis normalement et le CSS s'applique. Le coût est négligeable ici : la feuille globale fait 402 octets, et le CSS des composants est de toute façon embarqué dans le bundle JavaScript.

> Ce problème ne se voit **jamais** en `ng serve` (l'optimisation ne s'applique qu'en production) ni avec une CSP permissive. C'est typiquement le genre de régression qui n'apparaît qu'au packaging.

---

## Verrouillage réseau

L'application n'a besoin d'aucun accès réseau. Plutôt que de s'en remettre à la confiance, `tauri.conf.json` l'interdit par une politique de sécurité de contenu :

```json
"csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'self'; form-action 'none'"
```

Chaque directive a une raison précise :

- `'wasm-unsafe-eval'` — nécessaire à l'exécution du module WASM.
- `img-src data:` — les QR codes sont générés en data URL.
- `style-src` et `style-src-elem` en `'unsafe-inline'` — Angular injecte les styles de composants dans le DOM à l'exécution.
- `connect-src` limité à `ipc:` — **aucune requête HTTP sortante n'est possible**.
- `form-action 'none'`, `object-src 'none'` — aucune soumission de formulaire, aucun plugin.

Noter ce que la politique **n'autorise pas** : `script-src` reste sans `'unsafe-inline'`, donc aucun script inline ni gestionnaire d'événement HTML ne peut s'exécuter. C'est la garantie qui compte pour une application manipulant des seeds — et c'est précisément ce qui a révélé le piège de l'inlining CSS décrit plus haut.

---

## Avant une distribution publique

### Signer le binaire — indispensable

Un `.exe` non signé déclenche l'avertissement SmartScreen « Windows a protégé votre ordinateur ». Pour une application qui demande à l'utilisateur de lui confier sa seed, c'est un signal particulièrement malvenu — et cela habitue à ignorer exactement le type d'avertissement qui devrait alerter.

La configuration Tauri est **déjà prête** (`digestAlgorithm`, `timestampUrl`) : il ne manque que l'empreinte du certificat. Le choix du certificat, la procédure complète et l'alternative des empreintes SHA-256 sont détaillés dans **[SIGNATURE.md](SIGNATURE.md)**.

### Tester l'impression

L'application repose sur `window.print()`. WebView2 le gère nativement, mais **testez-le explicitement sur l'exécutable** : c'est le chemin par lequel sortent les fragments, et une régression ici rendrait l'application inutilisable pour son usage principal.

### Vérifier un aller-retour complet

Avant toute diffusion, sur l'exécutable et non sur `ng serve` : générer des fragments depuis une phrase de test, puis les reconstruire et comparer à l'original.

---

## L'étape d'après : supprimer le WASM

La chaîne actuelle est :

```
Angular  ──►  WASM (slip39-cli)  ──►  slip39-core
```

Tauri permet d'exposer `slip39-core` directement comme commande native, appelée depuis Angular via `invoke()` :

```
Angular  ──►  invoke()  ──►  slip39-core (natif)
```

Trois bénéfices : le module WASM disparaît des assets (donc plus de script de build à maintenir), la dérivation PBKDF2 s'exécute en natif, et surtout **le secret ne transite plus par la mémoire JavaScript** — ce qui rendrait enfin exploitable l'effacement mémoire par `zeroize` évoqué dans le README.

Ce n'est pas nécessaire au fonctionnement actuel, mais c'est la trajectoire naturelle du projet.
