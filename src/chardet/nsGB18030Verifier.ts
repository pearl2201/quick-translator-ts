import { nsVerifier } from './nsVerifier';

/**
 * Verifier for GB18030 encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsGB18030Verifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    286331153,
    1118481,
    286331153,
    286327057,
    286331153,
    286331153,
    858993459,
    286331187,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    1109533218,
    1717986917,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    1717986918,
    107374182
  ];

  private static m_states: number[] = [
    318767105,
    571543825,
    17965602,
    286326804,
    303109393,
    17
  ];

  private static m_stFactor: number = 7;
  private static m_charset: string = 'GB18030';

  override cclass(): number[] { return nsGB18030Verifier.m_cclass; }
  override states(): number[] { return nsGB18030Verifier.m_states; }
  override stFactor(): number { return nsGB18030Verifier.m_stFactor; }
  override charset(): string { return nsGB18030Verifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
