/**
 * Interface for charset detection.
 * Implementations process byte buffers and report the detected character encoding.
 */
export interface nsICharsetDetector {
  Init(observer: { Notify: (charset: string) => void }): void;
  DoIt(buf: Buffer, len: number, oDontFeedMe: boolean): boolean;
  Done(): void;
  isAscii(buf: Buffer, len: number): boolean;
}
