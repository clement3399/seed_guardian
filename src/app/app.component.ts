import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Bip39Service } from './services/bip39.service';
import { Fragment, QrService } from './services/qr.service';
import { Slip39Service } from './services/slip39.service';

type SecretMode = 'mnemonic' | 'hex';
type AppView = 'split' | 'recover';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  view: AppView = 'split';
  mode: SecretMode = 'mnemonic';

  mnemonicPhrase = '';
  secretHex = '';
  total = 5;
  threshold = 3;

  status = signal<'idle' | 'loading' | 'done' | 'error'>('idle');
  errorMessage = signal<string | null>(null);
  fragments = signal<Fragment[]>([]);

  constructor(
    private readonly bip39: Bip39Service,
    private readonly slip39: Slip39Service,
    private readonly qr: QrService
  ) { }

  setMode(mode: SecretMode): void {
    this.mode = mode;
    this.errorMessage.set(null);
  }

  /** Vecteur de test officiel BIP-39 (12 mots) — utile pour isoler un bug de saisie d'un bug applicatif. */
  fillTestVector(): void {
    this.mnemonicPhrase =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  }

  get mnemonicError(): string | null {
    if (!this.mnemonicPhrase.trim()) return null;
    const count = this.bip39.wordCount(this.mnemonicPhrase);
    if (![12, 15, 18, 21, 24].includes(count)) {
      return `${count} mots détectés — une phrase BIP-39 en compte 12, 15, 18, 21 ou 24.`;
    }
    const unknown = this.bip39.unknownWords(this.mnemonicPhrase);
    if (unknown.length) {
      return `Mot(s) absent(s) de la wordlist BIP-39 : ${unknown.join(', ')} — vérifie l'orthographe.`;
    }
    if (!this.bip39.isValid(this.mnemonicPhrase)) {
      return "Checksum invalide : tous les mots existent, mais au moins l'un d'eux (ou leur ordre) est incorrect. Recompare chaque mot avec ta fiche de récupération Ledger.";
    }
    return null;
  }

  /** Entropie hex effective à découper, quel que soit le mode de saisie actif. */
  private get effectiveSecretHex(): string {
    if (this.mode === 'mnemonic') {
      return this.mnemonicError || !this.mnemonicPhrase.trim()
        ? ''
        : this.bip39.toEntropyHex(this.mnemonicPhrase);
    }
    return this.secretHex;
  }

  get hexError(): string | null {
    if (this.mode !== 'hex' || !this.secretHex) return null;
    if (!/^[0-9a-fA-F]+$/.test(this.secretHex)) {
      return 'Le secret doit être en hexadécimal (0-9, a-f).';
    }
    if (this.secretHex.length % 2 !== 0) {
      return "Nombre de caractères hexadécimaux impair — il en manque un.";
    }
    return null;
  }

  get thresholdError(): string | null {
    if (this.threshold < 1 || this.total < 1) return null;
    if (this.threshold > this.total) {
      return 'Le seuil ne peut pas dépasser le nombre total de fragments.';
    }
    if (this.total > 16) {
      return 'SLIP-39 limite un groupe à 16 fragments maximum.';
    }
    if (this.threshold < 2) {
      return "Un seuil de 1 n'apporte aucune protection (autant ne pas fragmenter).";
    }
    return null;
  }

  get canGenerate(): boolean {
    const secretReady =
      this.mode === 'mnemonic'
        ? !!this.mnemonicPhrase.trim() && !this.mnemonicError
        : !!this.secretHex && !this.hexError;

    return secretReady && !this.thresholdError && this.status() !== 'loading';
  }

  async generate(): Promise<void> {
    if (!this.canGenerate) return;

    this.status.set('loading');
    this.errorMessage.set(null);
    this.fragments.set([]);

    try {
      const mnemonics = await this.slip39.splitSecret(
        this.effectiveSecretHex,
        this.threshold,
        this.total
      );
      const fragments = await this.qr.generateFragments(mnemonics);
      this.fragments.set(fragments);
      this.status.set('done');
    } catch (err) {
      console.error(err);
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Échec de la génération des fragments.'
      );
      this.status.set('error');
    }
  }

  reset(): void {
    this.secretHex = '';
    this.mnemonicPhrase = '';
    this.fragments.set([]);
    this.status.set('idle');
    this.errorMessage.set(null);
  }

  print(): void {
    window.print();
  }

  // --- Reconstruction ---

  recoveryShares: string[] = ['', ''];
  recoveryStatus = signal<'idle' | 'loading' | 'done' | 'error'>('idle');
  recoveryError = signal<string | null>(null);
  recoveredHex = signal<string | null>(null);
  recoveredMnemonic = signal<string | null>(null);

  setView(view: AppView): void {
    this.view = view;
    this.errorMessage.set(null);
    this.recoveryError.set(null);
  }

  addRecoveryShare(): void {
    this.recoveryShares.push('');
  }

  removeRecoveryShare(index: number): void {
    if (this.recoveryShares.length <= 2) return;
    this.recoveryShares.splice(index, 1);
  }

  get filledRecoveryShares(): string[] {
    return this.recoveryShares.map((s) => this.bip39.normalize(s)).filter(Boolean);
  }

  get canRecover(): boolean {
    return this.filledRecoveryShares.length >= 2 && this.recoveryStatus() !== 'loading';
  }

  async recover(): Promise<void> {
    if (!this.canRecover) return;

    this.recoveryStatus.set('loading');
    this.recoveryError.set(null);
    this.recoveredHex.set(null);
    this.recoveredMnemonic.set(null);

    try {
      const hex = await this.slip39.recoverSecret(this.filledRecoveryShares);
      this.recoveredHex.set(hex);

      // La reconversion en phrase BIP-39 ne s'applique que si l'entropie récupérée
      // correspond à une longueur standard (16/20/24/28/32 octets, soit 12 à 24 mots).
      const byteLength = hex.length / 2;
      if ([16, 20, 24, 28, 32].includes(byteLength)) {
        this.recoveredMnemonic.set(this.bip39.fromEntropyHex(hex));
      }

      this.recoveryStatus.set('done');
    } catch (err) {
      console.error(err);
      this.recoveryError.set(
        err instanceof Error ? err.message : 'Échec de la reconstruction — vérifie les fragments saisis.'
      );
      this.recoveryStatus.set('error');
    }
  }

  resetRecovery(): void {
    this.recoveryShares = ['', ''];
    this.recoveryStatus.set('idle');
    this.recoveryError.set(null);
    this.recoveredHex.set(null);
    this.recoveredMnemonic.set(null);
  }
}
