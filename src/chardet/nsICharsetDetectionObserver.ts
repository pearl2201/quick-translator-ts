/**
 * Observer interface for charset detection results.
 * Implementations receive a notification when a charset has been identified.
 */
export interface nsICharsetDetectionObserver {
  Notify(charset: string): void;
}
