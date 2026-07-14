import { nsPSMDetector } from './nsPSMDetector';
import { nsICharsetDetector } from './nsICharsetDetector';
import { nsVerifier } from './nsVerifier';
import { nsEUCStatistics } from './nsEUCStatistics';
import { nsUTF8Verifier } from './nsUTF8Verifier';
import { nsSJISVerifier } from './nsSJISVerifier';
import { nsEUCJPVerifier } from './nsEUCJPVerifier';
import { nsISO2022JPVerifier } from './nsISO2022JPVerifier';
import { nsEUCKRVerifier } from './nsEUCKRVerifier';
import { nsISO2022KRVerifier } from './nsISO2022KRVerifier';
import { nsBIG5Verifier } from './nsBIG5Verifier';
import { nsEUCTWVerifier } from './nsEUCTWVerifier';
import { nsGB2312Verifier } from './nsGB2312Verifier';
import { nsGB18030Verifier } from './nsGB18030Verifier';
import { nsISO2022CNVerifier } from './nsISO2022CNVerifier';
import { nsHZVerifier } from './nsHZVerifier';
import { nsCP1252Verifier } from './nsCP1252Verifier';
import { nsUCS2BEVerifier } from './nsUCS2BEVerifier';
import { nsUCS2LEVerifier } from './nsUCS2LEVerifier';
import { EUCJPStatistics } from './EUCJPStatistics';
import { EUCKRStatistics } from './EUCKRStatistics';
import { Big5Statistics } from './Big5Statistics';
import { EUCTWStatistics } from './EUCTWStatistics';
import { GB2312Statistics } from './GB2312Statistics';

/**
 * Main charset detector entry point.
 * Wraps nsPSMDetector with observer pattern for reporting results.
 */
export class nsDetector extends nsPSMDetector implements nsICharsetDetector {
  private mObserver: { Notify: (charset: string) => void } | null = null;

  constructor(langFlag?: number) {
    super(langFlag !== undefined ? langFlag : nsPSMDetector.ALL);
  }

  Init(aObserver: { Notify: (charset: string) => void }): void {
    this.mObserver = aObserver;
  }

  DoIt(aBuf: Buffer, aLen: number, oDontFeedMe: boolean): boolean {
    if (aBuf === null || oDontFeedMe) {
      return false;
    }
    this.HandleData(aBuf, aLen);
    return this.mDone;
  }

  Done(): void {
    this.DataEnd();
  }

  Report(charset: string): void {
    if (this.mObserver !== null) {
      this.mObserver.Notify(charset);
    }
  }

  isAscii(aBuf: Buffer, aLen: number): boolean {
    for (let i = 0; i < aLen; i++) {
      if ((0x0080 & aBuf[i]) !== 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Initialize verifier arrays based on language flag.
   * Sets up the appropriate encoding detectors for the target language group.
   */
  protected initVerifiers(langFlag: number): void {
    let currVerifierSet: number;
    if (langFlag >= 0 && langFlag < nsPSMDetector.NO_OF_LANGUAGES) {
      currVerifierSet = langFlag;
    } else {
      currVerifierSet = nsPSMDetector.ALL;
    }

    let mVerifier: nsVerifier[] = [];
    let mStatisticsData: (nsEUCStatistics | null)[] | null = null;

    if (currVerifierSet === nsPSMDetector.TRADITIONAL_CHINESE) {
      mVerifier = [
        new nsUTF8Verifier(), new nsBIG5Verifier(), new nsISO2022CNVerifier(),
        new nsEUCTWVerifier(), new nsCP1252Verifier(), new nsUCS2BEVerifier(),
        new nsUCS2LEVerifier()
      ];
      mStatisticsData = [null, new Big5Statistics(), null, new EUCTWStatistics(), null, null, null];
    } else if (currVerifierSet === nsPSMDetector.KOREAN) {
      mVerifier = [
        new nsUTF8Verifier(), new nsEUCKRVerifier(), new nsISO2022KRVerifier(),
        new nsCP1252Verifier(), new nsUCS2BEVerifier(), new nsUCS2LEVerifier()
      ];
    } else if (currVerifierSet === nsPSMDetector.SIMPLIFIED_CHINESE) {
      mVerifier = [
        new nsUTF8Verifier(), new nsGB2312Verifier(), new nsGB18030Verifier(),
        new nsISO2022CNVerifier(), new nsHZVerifier(), new nsCP1252Verifier(),
        new nsUCS2BEVerifier(), new nsUCS2LEVerifier()
      ];
    } else if (currVerifierSet === nsPSMDetector.JAPANESE) {
      mVerifier = [
        new nsUTF8Verifier(), new nsSJISVerifier(), new nsEUCJPVerifier(),
        new nsISO2022JPVerifier(), new nsCP1252Verifier(),
        new nsUCS2BEVerifier(), new nsUCS2LEVerifier()
      ];
    } else if (currVerifierSet === nsPSMDetector.CHINESE) {
      mVerifier = [
        new nsUTF8Verifier(), new nsGB2312Verifier(), new nsGB18030Verifier(),
        new nsBIG5Verifier(), new nsISO2022CNVerifier(), new nsHZVerifier(),
        new nsEUCTWVerifier(), new nsCP1252Verifier(),
        new nsUCS2BEVerifier(), new nsUCS2LEVerifier()
      ];
      mStatisticsData = [
        null, new GB2312Statistics(), null, new Big5Statistics(),
        null, null, new EUCTWStatistics(), null, null, null
      ];
    } else {
      // ALL
      mVerifier = [
        new nsUTF8Verifier(), new nsSJISVerifier(), new nsEUCJPVerifier(),
        new nsISO2022JPVerifier(), new nsEUCKRVerifier(), new nsISO2022KRVerifier(),
        new nsBIG5Verifier(), new nsEUCTWVerifier(), new nsGB2312Verifier(),
        new nsGB18030Verifier(), new nsISO2022CNVerifier(), new nsHZVerifier(),
        new nsCP1252Verifier(), new nsUCS2BEVerifier(), new nsUCS2LEVerifier()
      ];
      mStatisticsData = [
        null, null, new EUCJPStatistics(), null, new EUCKRStatistics(), null,
        new Big5Statistics(), new EUCTWStatistics(), new GB2312Statistics(),
        null, null, null, null, null, null
      ];
    }

    // Set up the detector with these arrays
    // nsPSMDetector expects these to be set
    (this as any).mVerifier = mVerifier;
    (this as any).mClassItems = mVerifier.length;
    (this as any).mClassRunSampler = mStatisticsData !== null;
    (this as any).mStatisticsData = mStatisticsData;
  }
}
