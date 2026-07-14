import { nsVerifier } from './nsVerifier';

/**
 * Verifier for windows-1252 encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsCP1252Verifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    572662305,
    2236962,
    572662306,
    572654114,
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
    572662274,
    16851234,
    572662304,
    285286690,
    572662306,
    572662306,
    572662306,
    572662306,
    286331153,
    286331153,
    554766609,
    286331153,
    286331153,
    286331153,
    554766609,
    286331153
  ];

  private static m_states: number[] = [
    571543601,
    340853778,
    65
  ];

  private static m_stFactor: number = 3;
  private static m_charset: string = 'windows-1252';

  override cclass(): number[] { return nsCP1252Verifier.m_cclass; }
  override states(): number[] { return nsCP1252Verifier.m_states; }
  override stFactor(): number { return nsCP1252Verifier.m_stFactor; }
  override charset(): string { return nsCP1252Verifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
