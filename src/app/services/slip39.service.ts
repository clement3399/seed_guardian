import { Injectable } from '@angular/core';

export interface GroupSpec {
  member_threshold: number;
  member_count: number;
}

/** Résultat brut renvoyé par split_secret : un tableau de groupes, chaque groupe étant un tableau de mnémoniques. */
type SplitResult = string[][];

/**
 * Wrapper autour du module WASM généré par wasm-pack (crate slip39 / Trezor SLIP-39).
 *
 * Le module est chargé dynamiquement via une URL calculée à l'exécution (et non un
 * littéral statique) : cela empêche esbuild d'essayer de bundler le .js/.wasm au build,
 * puisqu'il n'a aucun moyen de résoudre l'import statiquement. Le fichier est simplement
 * servi comme asset et chargé comme un vrai module ES par le navigateur.
 */
@Injectable({ providedIn: 'root' })
export class Slip39Service {
  private wasmModule: any | null = null;
  private loading: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.wasmModule) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      // Chemin relatif (et non '/assets/...') : dans l'exécutable Tauri les
      // fichiers sont chargés depuis le disque, où une racine absolue ne
      // pointe pas vers le dossier de l'application.
      const path = ['.', 'assets', 'wasm', 'slip39', 'slip39_cli.js'].join('/');
      const mod = await import(/* @vite-ignore */ path);
      if (typeof mod.default === 'function') {
        // wasm-bindgen "web" target : il faut initialiser le module avant de l'utiliser.
        await mod.default();
      }
      this.wasmModule = mod;
    })();

    return this.loading;
  }

  /**
   * Découpe un secret (hex) en fragments SLIP-39 selon un seuil M-sur-N.
   * Ne gère qu'un seul groupe pour l'instant (group_threshold = 1).
   */
  async splitSecret(secretHex: string, threshold: number, total: number): Promise<string[]> {
    await this.init();

    const groups: GroupSpec[] = [{ member_threshold: threshold, member_count: total }];

    const raw = this.wasmModule.split_secret(
      secretHex.toLowerCase(),
      1,
      JSON.stringify(groups)
    );

    // split_secret peut renvoyer soit un JsValue déjà désérialisé par serde-wasm-bindgen,
    // soit une chaîne JSON selon la version du binding — on gère les deux cas.
    const parsed: SplitResult = typeof raw === 'string' ? JSON.parse(raw) : raw;

    return parsed[0];
  }

  async recoverSecret(shares: string[]): Promise<string> {
    await this.init();
    return this.wasmModule.recover_secret(JSON.stringify(shares));
  }
}
