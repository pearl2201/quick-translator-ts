import { nsVerifier } from './nsVerifier';

/**
 * Verifier for HZ-GB-2312 encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsHZVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    1,
    0,
    0,
    4096,
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
    38813696,
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
    286331153,
    286331153,
    286331153,
    286331153
  ];

  private static m_states: number[] = [
    285213456,
    572657937,
    335548706,
    341120533,
    336872468,
    36
  ];

  private static m_stFactor: number = 6;
  private static m_charset: string = 'HZ-GB-2312';

  override cclass(): number[] { return nsHZVerifier.m_cclass; }
  override states(): number[] { return nsHZVerifier.m_states; }
  override stFactor(): number { return nsHZVerifier.m_stFactor; }
  override charset(): string { return nsHZVerifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
