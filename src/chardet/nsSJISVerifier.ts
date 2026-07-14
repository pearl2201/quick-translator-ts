import { nsVerifier } from './nsVerifier';

/**
 * Verifier for Shift_JIS encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsSJISVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    286331152,
    1118481,
    286331153,
    286327057,
    286331153,
    286331153,
    286331153,
    286331153,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    304226850,
    858993459,
    858993459,
    858993459,
    858993459,
    572662308,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    858993459,
    1145393971,
    1145324612,
    279620
  ];

  private static m_states: number[] = [
    286339073,
    572657937,
    4386
  ];

  private static m_stFactor: number = 6;
  private static m_charset: string = 'Shift_JIS';

  override cclass(): number[] { return nsSJISVerifier.m_cclass; }
  override states(): number[] { return nsSJISVerifier.m_states; }
  override stFactor(): number { return nsSJISVerifier.m_stFactor; }
  override charset(): string { return nsSJISVerifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
