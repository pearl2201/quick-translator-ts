import { nsVerifier } from './nsVerifier';

/**
 * Verifier for UTF-16LE encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsUCS2LEVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    0,
    2097408,
    0,
    12288,
    0,
    3355440,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1409286144
  ];

  private static m_states: number[] = [
    288647014,
    572657937,
    303387938,
    1712657749,
    357927015,
    1427182933,
    1381717
  ];

  private static m_stFactor: number = 6;
  private static m_charset: string = 'UTF-16LE';

  override cclass(): number[] { return nsUCS2LEVerifier.m_cclass; }
  override states(): number[] { return nsUCS2LEVerifier.m_states; }
  override stFactor(): number { return nsUCS2LEVerifier.m_stFactor; }
  override charset(): string { return nsUCS2LEVerifier.m_charset; }
  override isUCS2(): boolean { return true; }
}
