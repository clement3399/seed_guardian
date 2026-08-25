import { Injectable } from '@angular/core';
import * as QRCode from 'qrcode';

export interface Fragment {
  index: number;
  total: number;
  mnemonic: string;
  qrDataUrl: string;
}

@Injectable({ providedIn: 'root' })
export class QrService {
  async generateFragments(mnemonics: string[]): Promise<Fragment[]> {
    const total = mnemonics.length;

    return Promise.all(
      mnemonics.map(async (mnemonic, i) => ({
        index: i + 1,
        total,
        mnemonic,
        qrDataUrl: await QRCode.toDataURL(mnemonic, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 360,
          color: { dark: '#1b1d21', light: '#ffffff' },
        }),
      }))
    );
  }
}
