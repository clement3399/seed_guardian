# Signature du binaire Windows

Marche à suivre pour signer `seed-guardian.exe` et ses installeurs, le jour où un certificat de signature de code est disponible.

**État actuel : les binaires ne sont pas signés.** La configuration est prête ; il ne manque que l'empreinte du certificat.

---

## Ce que la signature apporte

Une signature de code répond à deux questions au lancement :

1. **Qui a publié ce fichier ?** — une identité vérifiée par une autorité de certification, pas un nom librement déclaré.
2. **A-t-il été modifié depuis ?** — la signature couvre le contenu ; un octet altéré l'invalide.

Elle ne garantit pas que le logiciel est honnête : seulement qu'il provient bien de son auteur déclaré et qu'il est intact. C'est exactement ce qui compte ici.

### Pourquoi c'est important pour cette application

Sans signature, Windows affiche « **Windows a protégé votre ordinateur — Éditeur inconnu** ». Trois conséquences, par ordre de gravité :

**On entraîne le mauvais réflexe.** On demande à l'utilisateur d'ignorer un avertissement de sécurité juste avant de lui faire saisir la seed de son wallet — précisément le comportement qu'exploitent les faux wallets et les installeurs piégés.

**On perd le canal qui détecte les substitutions.** C'est le risque concret : une version modifiée de l'application redistribuée ailleurs — même interface, générateur d'aléa affaibli, fragments prédictibles. Un binaire signé rend la contrefaçon détectable ; sans signature, l'authentique et la copie sont indiscernables, tous deux « Éditeur inconnu ».

**La crédibilité en pâtit**, pour une application dont l'argument central est la sécurité.

---

## 1. Obtenir un certificat

Il faut un certificat **de signature de code** — pas un certificat TLS/serveur, l'usage est différent.

| | **OV** (Organization Validation) | **EV** (Extended Validation) |
|---|---|---|
| Prix indicatif | 200–400 €/an | 350–600 €/an |
| Réputation SmartScreen | à construire | **immédiate** |
| Vérification | identité de l'entité | plus poussée, entité juridique requise |

Autorités courantes : DigiCert, Sectigo, GlobalSign, SSL.com, Certum.

**Pour un particulier.** Ces certificats sont normalement délivrés à des entités juridiques. Certaines autorités — Certum en particulier, souvent la moins chère en Europe — proposent des certificats « Open Source Code Signing » aux personnes physiques, sur justificatif d'identité. C'est la voie à examiner en premier faute de structure juridique.

**Stockage matériel obligatoire.** Depuis juin 2023, la clé privée doit résider sur un support certifié (token USB ou HSM) : plus de simple fichier `.pfx` livré par courriel. Cela ajoute un délai de livraison et parfois un coût matériel.

### La réputation SmartScreen

Point qui surprend souvent : **avec un certificat OV, SmartScreen continue d'avertir au début.** La réputation se construit sur le volume de téléchargements et l'absence de signalements, ce qui peut prendre des semaines — et chaque nouvelle version repart partiellement de zéro.

Le certificat EV accorde la réputation immédiatement. C'est sa principale justification et, pour une application manipulant des seeds, ce qui décide généralement du choix malgré le surcoût.

---

## 2. Configurer Tauri

[src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) contient déjà les paramètres qui ne dépendent pas du certificat :

```json
"windows": {
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com",
  "nsis": { "installMode": "currentUser" }
}
```

Une fois le certificat installé, récupérez son empreinte :

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Format-List Subject, Thumbprint
```

Puis ajoutez-la à ce même bloc :

```json
"windows": {
  "certificateThumbprint": "AB12CD34...",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com",
  "nsis": { "installMode": "currentUser" }
}
```

`npm run tauri:build` signera alors l'exécutable **et** les deux installeurs, sans autre manipulation.

> **Tant que `certificateThumbprint` est absent, aucune signature n'est tentée** et le build se déroule normalement. Les deux autres clés restent sans effet.

### L'horodatage n'est pas optionnel

`timestampUrl` atteste que la signature a été apposée pendant la validité du certificat. Sans lui, **tous les binaires deviennent « non signés » à l'expiration du certificat** — y compris ceux déjà distribués. Avec lui, ils restent valides indéfiniment.

### Si la clé est sur un token USB

Certains tokens exigent un outil propriétaire plutôt que l'empreinte. Tauri accepte alors une commande de signature personnalisée, où `%1` est remplacé par le fichier à signer :

```json
"windows": {
  "signCommand": "signtool sign /sha1 AB12CD34 /fd sha256 /tr http://timestamp.digicert.com /td sha256 %1"
}
```

---

## 3. Vérifier

```powershell
Get-AuthenticodeSignature .\seed-guardian.exe |
  Format-List Status, SignerCertificate, TimeStamperCertificate
```

`Status` doit valoir `Valid`. Vérifiez que `TimeStamperCertificate` n'est pas vide — sinon l'horodatage a échoué et la signature expirera avec le certificat.

À vérifier sur les trois livrables : l'exécutable, l'installeur NSIS et le MSI.

---

## En attendant : publier les empreintes

Tant que les binaires ne sont pas signés, publiez leurs empreintes SHA-256 pour permettre une vérification manuelle :

```powershell
Get-FileHash .\seed-guardian.exe -Algorithm SHA256
```

Cela ne supprime pas l'avertissement SmartScreen, mais donne à un utilisateur attentif un moyen de confirmer qu'il détient le bon fichier.

**Condition indispensable** : les empreintes doivent être publiées **ailleurs** que là où se télécharge le binaire. Sinon, quiconque remplace l'un remplace l'autre, et la vérification ne prouve plus rien.

### L'alternative : compiler soi-même

La compilation est reproductible depuis les sources. Un utilisateur exigeant peut construire lui-même l'exécutable (`npm run tauri:build`) plutôt que de faire confiance à un binaire distribué — ce qui évacue entièrement la question. C'est d'ailleurs cohérent avec le choix de ne pas versionner le WASM compilé, expliqué dans le [README](README.md).

---

## Recommandation

**Usage personnel ou entre proches** : ne pas signer. Publier les empreintes et documenter la vérification suffit ; le coût annuel ne se justifie pas.

**Diffusion publique** (GitHub Releases, site web) : signer, avec un certificat **EV**. L'écart de prix avec l'OV est faible au regard de ce qu'il évite — demander à chaque utilisateur de contourner un avertissement de sécurité au premier lancement d'une application à qui il confie sa seed.
