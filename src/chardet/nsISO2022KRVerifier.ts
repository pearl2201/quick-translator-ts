import { nsVerifier } from './nsVerifier';

/**
 * Verifier for ISO-2022-KR encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsISO2022KRVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    2,
    0,
    0,
    4096,
    196608,
    64,
    0,
    0,
    20480,
    0,
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
    285212976,
    572657937,
    289476898,
    286593297,
    8465
  ];

  private static m_stFactor: number = 6;
  private static m_charset: string = 'ISO-2022-KR';

  override cclass(): number[] { return nsISO2022KRVerifier.m_cclass; }
  override states(): number[] { return nsISO2022KRVerifier.m_states; }
  override stFactor(): number { return nsISO2022KRVerifier.m_stFactor; }
  override charset(): string { return nsISO2022KRVerifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
