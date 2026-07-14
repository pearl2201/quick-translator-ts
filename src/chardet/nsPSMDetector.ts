import { nsVerifier } from './nsVerifier';
import { nsEUCStatistics } from './nsEUCStatistics';
import { nsEUCSampler } from './nsEUCSampler';

/**
 * Probabilistic State Machine detector.
 * Orchestrates multiple verifiers in parallel, eliminating candidates that produce error states
 * until one matches (eItsMe). Falls back to statistical sampling when needed.
 */
export abstract class nsPSMDetector {
  public static readonly ALL = 0;
  public static readonly JAPANESE = 1;
  public static readonly CHINESE = 2;
  public static readonly SIMPLIFIED_CHINESE = 3;
  public static readonly TRADITIONAL_CHINESE = 4;
  public static readonly KOREAN = 5;
  public static readonly NO_OF_LANGUAGES = 6;
  public static readonly MAX_VERIFIERS = 16;

  protected mVerifier: nsVerifier[] = [];
  protected mStatisticsData: nsEUCStatistics[] | null = null;

  protected mSampler: nsEUCSampler = new nsEUCSampler();
  protected mState: number[] = new Array(nsPSMDetector.MAX_VERIFIERS).fill(0);
  protected mItemIdx: number[] = new Array(nsPSMDetector.MAX_VERIFIERS).fill(0);

  protected mItems = 0;
  protected mClassItems = 0;

  protected mDone = false;
  protected mRunSampler = false;
  protected mClassRunSampler = false;

  constructor();
  constructor(langFlag: number);
  constructor(aItems?: number, aVerifierSet?: nsVerifier[], aStatisticsSet?: nsEUCStatistics[]);
  constructor(aItems?: number, aVerifierSet?: nsVerifier[], aStatisticsSet?: nsEUCStatistics[]) {
    if (aVerifierSet !== undefined && aStatisticsSet !== undefined && aItems !== undefined) {
      this.mClassRunSampler = aStatisticsSet !== null;
      this.mStatisticsData = aStatisticsSet;
      this.mVerifier = aVerifierSet;
      this.mClassItems = aItems;
    } else if (typeof aItems === 'number' && aVerifierSet === undefined) {
      this.initVerifiers(aItems);
    } else {
      this.initVerifiers(nsPSMDetector.ALL);
    }
    this.Reset();
  }

  /**
   * Reset all verifier states and the sampler to begin a new detection cycle.
   */
  public Reset(): void {
    this.mRunSampler = this.mClassRunSampler;
    this.mDone = false;
    this.mItems = this.mClassItems;

    for (let i = 0; i < this.mItems; i++) {
      this.mState[i] = 0;
      this.mItemIdx[i] = i;
    }

    this.mSampler.Reset();
  }

  /**
   * Process a buffer of data through all active verifiers.
   * Advances each verifier's DFA state and reports the charset if a definitive match is found.
   */
  protected HandleData(aBuf: Buffer, aLen: number): void {
    for (let i = 0; i < aLen; i++) {
      const b = 0xff & aBuf[i];
      for (let j = 0; this.mDone === false && j < this.mItems; j++) {
        const idx = this.mItemIdx[j];
        const state = nsVerifier.getNextState(this.mVerifier[idx], b, this.mState[idx]);
        this.mState[idx] = state;
        if (state === nsVerifier.eItsMe) {
          this.mDone = true;
          this.Report(this.mVerifier[idx].charset());
          break;
        }
      }
    }

    if (this.mRunSampler && !this.mDone) {
      if (!this.mSampler.Sample(aBuf, aLen)) {
        this.mRunSampler = false;
      }
    }
  }

  /**
   * Finalize detection after all data has been processed.
   * Falls back to statistical sampling or reports the most likely charset from remaining candidates.
   */
  protected DataEnd(): void {
    if (this.mDone) {
      return;
    }

    if (this.mRunSampler) {
      const stRunSampler = this.sampling();
      if (stRunSampler) {
        for (let i = 0; i < this.mItems; i++) {
          this.mState[i] = 0;
        }
        this.mRunSampler = false;
      }
    }

    if (!this.mDone) {
      for (let i = 0; i < this.mItems; i++) {
        const idx = this.mItemIdx[i];
        if (this.mState[idx] === nsVerifier.eStart ||
            this.mState[idx] === nsVerifier.eError) {
          // eligible
        } else {
          // not eligible - shift to front
          const tmp = this.mItemIdx[i];
          for (let j = i; j > 0; j--) {
            this.mItemIdx[j] = this.mItemIdx[j - 1];
          }
          this.mItemIdx[0] = tmp;
        }
      }
    }

    for (let i = 0; i < this.mItems; i++) {
      const idx = this.mItemIdx[i];
      if (this.mState[idx] === nsVerifier.eItsMe ||
          this.mState[idx] === nsVerifier.eStart ||
          this.mState[idx] === nsVerifier.eError) {
        this.Report(this.mVerifier[idx].charset());
        this.mDone = true;
        break;
      }
    }
  }

  private sampling(): number {
    this.mSampler.CalFreq();

    const stResult = 0;
    if (this.mStatisticsData !== null) {
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < this.mItems; i++) {
        if (this.mStatisticsData[this.mItemIdx[i]] !== null) {
          const score = this.mSampler.GetScore(
            this.mStatisticsData[this.mItemIdx[i]].mFirstByteFreq(),
            this.mStatisticsData[this.mItemIdx[i]].mFirstByteWeight(),
            this.mStatisticsData[this.mItemIdx[i]].mSecondByteFreq(),
            this.mStatisticsData[this.mItemIdx[i]].mSecondByteWeight()
          );
          if (0 === i || score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
      }
      if (bestIdx >= 0) {
        this.Report(this.mVerifier[this.mItemIdx[bestIdx]].charset());
        this.mDone = true;
        return 1;
      }
    }
    return stResult;
  }

  public abstract Report(charset: string): void;

  protected abstract initVerifiers(langFlag: number): void;
}
