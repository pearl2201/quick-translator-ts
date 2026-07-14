import { nsDetector } from '../chardet/nsDetector';
import { Notifier } from './Notifier';
import { IFileSystem } from '../io/IFileSystem';
import { FileSystemConfig } from '../io/FileSystemConfig';

/**
 * Detects the character encoding of a Chinese text file.
 * Uses the Mozilla chardet library (ported to TS) with a fallback to GB2312.
 * Also checks for embedded charset declarations in HTML content.
 *
 * Uses FileSystemConfig.instance for file I/O.
 */
export class CharsetDetector {
  static DetectedCharset: string = '';

  static DetectChineseCharset(filePath: string): string {
    const fs: IFileSystem = FileSystemConfig.instance;
    this.DetectedCharset = 'GB2312';
    const detector = new nsDetector(3);
    const observer = new Notifier();
    detector.Init(observer);

    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);

    const slicedBuf = buf.subarray(0, bytesRead);
    const isAscii = detector.isAscii(slicedBuf, bytesRead);

    if (!isAscii) {
      detector.DoIt(slicedBuf, bytesRead, false);
    }
    detector.Done();

    if (isAscii) {
      this.DetectedCharset = 'ASCII';
    }

    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('CONTENT="text/html; charset=gb2312"')) {
      this.DetectedCharset = 'GB2312';
    }

    return this.DetectedCharset;
  }
}
