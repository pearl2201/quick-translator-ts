/**
 * Abstract verifier for charset detection state machine.
 * Each concrete verifier defines character classes and state transition tables for a specific encoding.
 */
export abstract class nsVerifier {
  public static readonly eStart = 0 as const;
  public static readonly eError = 1 as const;
  public static readonly eItsMe = 2 as const;
  public static readonly eidxSft4bits = 3;
  public static readonly eSftMsk4bits = 7;
  public static readonly eBitSft4bits = 2;
  public static readonly eUnitMsk4bits = 0x0000000f;

  abstract charset(): string;
  abstract stFactor(): number;
  abstract cclass(): number[];
  abstract states(): number[];
  abstract isUCS2(): boolean;

  /**
   * Compute the next state in the DFA for byte b in current state s.
   */
  public static getNextState(v: nsVerifier, b: number, s: number): number {
    const cclassIdx = (b & 0xff) >> nsVerifier.eidxSft4bits;
    const cclassShift = ((b & nsVerifier.eSftMsk4bits) << nsVerifier.eBitSft4bits);
    const cclassVal = (v.cclass()[cclassIdx] >> cclassShift) & nsVerifier.eUnitMsk4bits;

    const stateIdx = (s * v.stFactor() + cclassVal) & 0xff;
    const statesShift = ((s * v.stFactor() + cclassVal) & nsVerifier.eSftMsk4bits) << nsVerifier.eBitSft4bits;
    const statesVal = (v.states()[stateIdx >> nsVerifier.eidxSft4bits] >> statesShift) & nsVerifier.eUnitMsk4bits;

    return statesVal;
  }
}
