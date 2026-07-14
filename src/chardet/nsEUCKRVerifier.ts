import { nsVerifier } from './nsVerifier';

/**
 * Verifier for EUC-KR encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsEUCKRVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    286331153,
    1118481,
    286331153,
    286327057,
    286331153,
    286331153,
    286331153,
    286331153,
    286331153,
    286331153,
    286331153,
    286331153,
    286331153,
    286331153,
    286331153,
    286331153,
    0,
    0,
    0,
    0,
    572662304,
    858923554,
    572662306,
    572662306,
    572662306,
    572662322,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    35791394
  ];

  private static m_states: number[] = [
    286331649,
    1122850
  ];

  private static m_stFactor: number = 4;
  private static m_charset: string = 'EUC-KR';

  override cclass(): number[] { return nsEUCKRVerifier.m_cclass; }
  override states(): number[] { return nsEUCKRVerifier.m_states; }
  override stFactor(): number { return nsEUCKRVerifier.m_stFactor; }
  override charset(): string { return nsEUCKRVerifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
