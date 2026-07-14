import { nsVerifier } from './nsVerifier';

/**
 * Verifier for EUC-JP encoding.
 * Contains machine-generated character class and state transition tables.
 */
export class nsEUCJPVerifier extends nsVerifier {
  // Bit-packed character class table (32 entries × 8 nibbles = 256 byte classifications).
  private static m_cclass: number[] = [
    1145324612,
    1430537284,
    1145324612,
    1145328708,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1145324612,
    1431655765,
    827675989,
    1431655765,
    1431655765,
    572662309,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    572662306,
    0,
    0,
    0,
    1342177280
  ];

  private static m_states: number[] = [
    286282563,
    572657937,
    286265378,
    319885329,
    4371
  ];

  private static m_stFactor: number = 6;
  private static m_charset: string = 'EUC-JP';

  override cclass(): number[] { return nsEUCJPVerifier.m_cclass; }
  override states(): number[] { return nsEUCJPVerifier.m_states; }
  override stFactor(): number { return nsEUCJPVerifier.m_stFactor; }
  override charset(): string { return nsEUCJPVerifier.m_charset; }
  override isUCS2(): boolean { return false; }
}
