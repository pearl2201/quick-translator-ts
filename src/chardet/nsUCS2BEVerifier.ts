import { nsVerifier } from './nsVerifier';

/**
 * Verifier for UTF-16BE encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsUCS2BEVerifier extends nsVerifier {
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
    288626549,
    572657937,
    291923490,
    1713792614,
    393569894,
    1717659269,
    1140326
  ];

  private static m_stFactor: number = 6;
  private static m_charset: string = 'UTF-16BE';

  override cclass(): number[] { return nsUCS2BEVerifier.m_cclass; }
  override states(): number[] { return nsUCS2BEVerifier.m_states; }
  override stFactor(): number { return nsUCS2BEVerifier.m_stFactor; }
  override charset(): string { return nsUCS2BEVerifier.m_charset; }
  override isUCS2(): boolean { return true; }
}
