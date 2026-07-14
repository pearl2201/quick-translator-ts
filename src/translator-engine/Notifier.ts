import { nsICharsetDetectionObserver } from '../chardet/nsICharsetDetectionObserver';
import { CharsetDetector } from './CharsetDetector';

/**
 * Callback receiver for the charset detector.
 * When the nsDetector identifies a charset, it calls Notify()
 * which stores the result in CharsetDetector.DetectedCharset.
 */
export class Notifier implements nsICharsetDetectionObserver {
  Notify(charset: string): void {
    CharsetDetector.DetectedCharset = charset;
  }
}
