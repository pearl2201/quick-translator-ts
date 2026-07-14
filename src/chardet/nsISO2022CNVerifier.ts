import { nsVerifier } from './nsVerifier';

/**
 * Verifier for ISO-2022-CN encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsISO2022CNVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    2,
    0,
    0,
    4096,
    0,
    48,
    0,
    0,
    16384,
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
    304,
    286331152,
    572662289,
    336663074,
    286335249,
    286331237,
    286335249,
    18944273
  ];

  private static m_stFactor: number = 9;
  private static m_charset: string = 'ISO-2022-CN';

  override cclass(): number[] { return nsISO2022CNVerifier.m_cclass; }
  override states(): number[] { return nsISO2022CNVerifier.m_states; }
  override stFactor(): number { return nsISO2022CNVerifier.m_stFactor; }
  override charset(): string { return nsISO2022CNVerifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
