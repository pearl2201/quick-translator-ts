import { nsVerifier } from './nsVerifier';

/**
 * Verifier for GB2312 encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsGB2312Verifier extends nsVerifier {
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
    858993442,
    572662306,
    572662306,
    572662306,
    572662306,
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
  private static m_charset: string = 'GB2312';

  override cclass(): number[] { return nsGB2312Verifier.m_cclass; }
  override states(): number[] { return nsGB2312Verifier.m_states; }
  override stFactor(): number { return nsGB2312Verifier.m_stFactor; }
  override charset(): string { return nsGB2312Verifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
