import { nsVerifier } from './nsVerifier';

/**
 * Verifier for UTF-8 encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsUTF8Verifier extends nsVerifier {
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
    858989090,
    1145324612,
    1145324612,
    1145324612,
    1431655765,
    1431655765,
    1431655765,
    1431655765,
    1717986816,
    1717986918,
    1717986918,
    1717986918,
    -2004318073,
    -2003269496,
    -1145324614,
    16702940
  ];

  private static m_states: number[] = [
    -1408167679,
    878082233,
    286331153,
    286331153,
    572662306,
    572662306,
    290805009,
    286331153,
    290803985,
    286331153,
    293041937,
    286331153,
    293015825,
    286331153,
    295278865,
    286331153,
    294719761,
    286331153,
    298634257,
    286331153,
    297865489,
    286331153,
    287099921,
    286331153,
    285212689,
    286331153
  ];

  private static m_stFactor: number = 16;
  private static m_charset: string = 'UTF-8';

  override cclass(): number[] { return nsUTF8Verifier.m_cclass; }
  override states(): number[] { return nsUTF8Verifier.m_states; }
  override stFactor(): number { return nsUTF8Verifier.m_stFactor; }
  override charset(): string { return nsUTF8Verifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
