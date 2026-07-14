/**
 * Samples byte sequences and computes frequency scores against known encoding statistics.
 * Used as a fallback when the state machine cannot uniquely identify the charset.
 */
export class nsEUCSampler {
  private mTotal = 0;
  private mThreshold = 200;
  private mState = 0;

  public mFirstByteCnt: number[] = new Array(94).fill(0);
  public mSecondByteCnt: number[] = new Array(94).fill(0);
  public mFirstByteFreq: number[] = new Array(94).fill(0);
  public mSecondByteFreq: number[] = new Array(94).fill(0);

  constructor() {
    this.Reset();
  }

  /**
   * Reset the sampler state, clearing all accumulated byte counts.
   */
  public Reset(): void {
    this.mTotal = 0;
    this.mState = 0;
    for (let i = 0; i < 94; i++) {
      this.mFirstByteCnt[i] = 0;
      this.mSecondByteCnt[i] = 0;
    }
  }

  /**
   * Check whether enough data has been sampled for statistical analysis.
   */
  public EnoughData(): boolean {
    return this.mTotal > this.mThreshold;
  }

  /**
   * Check whether any data at all has been sampled.
   */
  public GetSomeData(): boolean {
    return this.mTotal > 1;
  }

  /**
   * Sample a buffer of bytes, tracking first and second byte frequencies for EUC-style sequences.
   * Returns false if a non-EUC sequence is detected.
   */
  public Sample(aIn: Buffer, aLen: number): boolean {
    if (this.mState === 1) {
      return false;
    }

    for (let i = 0; i < aLen && this.mState !== 1; i++) {
      const p = i;
      switch (this.mState) {
        case 0:
          if ((aIn[p] & 0x0080) !== 0) {
            if ((0xff === (0xff & aIn[p])) || (0xa1 > (0xff & aIn[p]))) {
              this.mState = 1;
            } else {
              this.mTotal++;
              this.mFirstByteCnt[(0xff & aIn[p]) - 0xa1]++;
              this.mState = 2;
            }
          }
          break;
        case 1:
          break;
        case 2:
          if ((aIn[p] & 0x0080) !== 0) {
            if ((0xff === (0xff & aIn[p])) || (0xa1 > (0xff & aIn[p]))) {
              this.mState = 1;
            } else {
              this.mTotal++;
              this.mSecondByteCnt[(0xff & aIn[p]) - 0xa1]++;
              this.mState = 0;
            }
          } else {
            this.mState = 1;
          }
          break;
        default:
          this.mState = 1;
          break;
      }
    }
    return this.mState !== 1;
  }

  /**
   * Calculate frequency distributions from accumulated byte counts.
   */
  public CalFreq(): void {
    for (let i = 0; i < 94; i++) {
      this.mFirstByteFreq[i] = this.mFirstByteCnt[i] / this.mTotal;
      this.mSecondByteFreq[i] = this.mSecondByteCnt[i] / this.mTotal;
    }
  }

  /**
   * Compute a similarity score between sampled frequencies and reference encoding statistics.
   * Higher scores indicate a better match.
   */
  public GetScore(
    aFirstByteFreq: number[], aFirstByteWeight: number,
    aSecondByteFreq: number[], aSecondByteWeight: number
  ): number {
    return aFirstByteWeight * this.getScoreInternal(aFirstByteFreq, this.mFirstByteFreq) +
      aSecondByteWeight * this.getScoreInternal(aSecondByteFreq, this.mSecondByteFreq);
  }

  private getScoreInternal(array1: number[], array2: number[]): number {
    let s = 0.0;
    const sum = (a: number[]) => a.reduce((acc, v) => acc + v, 0);
    const s1 = sum(array1);
    const s2 = sum(array2);
    if (s1 === 0 || s2 === 0) {
      return 0.0;
    }
    for (let i = 0; i < 94; i++) {
      s += Math.abs(array1[i] / s1 - array2[i] / s2);
    }
    return s;
  }
}
