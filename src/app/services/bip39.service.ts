import { Injectable } from '@angular/core';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';

@Injectable({ providedIn: 'root' })
export class Bip39Service {
  private readonly englishWordlist = englishWordlist;

  /** Nettoie une phrase collée (espaces multiples, retours à la ligne, casse). */
  normalize(phrase: string): string {
    return phrase.trim().toLowerCase().split(/\s+/).join(' ');
  }

  wordCount(phrase: string): number {
    const cleaned = this.normalize(phrase);
    return cleaned ? cleaned.split(' ').length : 0;
  }

  /** Mots qui n'existent pas dans la wordlist BIP-39 anglaise (fautes de frappe probables). */
  unknownWords(phrase: string): string[] {
    const cleaned = this.normalize(phrase);
    if (!cleaned) return [];
    return cleaned.split(' ').filter((w) => !this.englishWordlist.includes(w));
  }

  /** Valide la wordlist ET le checksum intégré au mnémonique. */
  isValid(phrase: string): boolean {
    const cleaned = this.normalize(phrase);
    if (!cleaned) return false;
    try {
      return validateMnemonic(cleaned, this.englishWordlist);
    } catch {
      return false;
    }
  }

  /** 24 mots -> 32 octets d'entropie, sous forme hex (checksum vérifié et retiré). */
  toEntropyHex(phrase: string): string {
    const entropy = mnemonicToEntropy(this.normalize(phrase), this.englishWordlist);
    return Array.from(entropy)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** Entropie hex -> phrase mnémonique BIP-39 (avec checksum recalculé). */
  fromEntropyHex(hex: string): string {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return entropyToMnemonic(bytes, this.englishWordlist);
  }
}
