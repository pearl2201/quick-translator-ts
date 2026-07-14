import { nsVerifier } from './nsVerifier';

/**
 * Verifier for ISO-2022-JP encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsISO2022JPVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    2,
    570425344,
    0,
    4096,
    458752,
    3,
    0,
    0,
    1030,
    1280,
    0,
    0,
    0,
    0,
    0,
    0,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306
  ];

  private static m_states: number[] = [
    304,
    286331153,
    572662306,
    1091653905,
    303173905,
    287445265
  ];

  private static m_stFactor: number = 8;
  private static m_charset: string = 'ISO-2022-JP';

  override cclass(): number[] { return nsISO2022JPVerifier.m_cclass; }
  override states(): number[] { return nsISO2022JPVerifier.m_states; }
  override stFactor(): number { return nsISO2022JPVerifier.m_stFactor; }
  override charset(): string { return nsISO2022JPVerifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
