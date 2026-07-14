import { nsVerifier } from './nsVerifier';

/**
 * Verifier for Big5 encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsBIG5Verifier extends nsVerifier {
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
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    304226850,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    858993460,
    858993459,
    858993459,
    858993459,
    858993459,
    858993459,
    858993459,
    858993459,
    858993459,
    858993459,
    858993459,
    53687091
  ];

  private static m_states: number[] = [
    286339073,
    304226833,
    1
  ];

  private static m_stFactor: number = 5;
  private static m_charset: string = 'Big5';

  override cclass(): number[] { return nsBIG5Verifier.m_cclass; }
  override states(): number[] { return nsBIG5Verifier.m_states; }
  override stFactor(): number { return nsBIG5Verifier.m_stFactor; }
  override charset(): string { return nsBIG5Verifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
