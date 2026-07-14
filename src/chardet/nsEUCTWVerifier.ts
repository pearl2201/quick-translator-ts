import { nsVerifier } from './nsVerifier';

/**
 * Verifier for x-euc-tw encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsEUCTWVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    572662306,
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
    0,
    100663296,
    0,
    0,
    1145324592,
    286331221,
    286331153,
    286331153,
    858985233,
    858993459,
    858993459,
    858993459,
    858993459,
    858993459,
    858993459,
    53687091
  ];

  private static m_states: number[] = [
    338898961,
    571543825,
    269623842,
    286330880,
    1052949,
    16
  ];

  private static m_stFactor: number = 7;
  private static m_charset: string = 'x-euc-tw';

  override cclass(): number[] { return nsEUCTWVerifier.m_cclass; }
  override states(): number[] { return nsEUCTWVerifier.m_states; }
  override stFactor(): number { return nsEUCTWVerifier.m_stFactor; }
  override charset(): string { return nsEUCTWVerifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
