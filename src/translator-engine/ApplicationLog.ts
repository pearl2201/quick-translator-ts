import { IFileSystem } from '../io/IFileSystem';
import { FileSystemConfig } from '../io/FileSystemConfig';

/**
 * Simple file-based exception logger.
 * Writes error details to `<application>.log` in the given directory.
 * Rotates (deletes) the log file when it exceeds ~1 MB.
 *
 * Uses FileSystemConfig.instance for file I/O.
 */
export class ApplicationLog {
  static Log(applicationPath: string, application: string, exception: Error): void {
    try {
      const fs: IFileSystem = FileSystemConfig.instance;
      const filePath = fs.join(applicationPath, application + '.log');
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > 1000000) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // File doesn't exist yet, that's fine
      }

      const contents = `${new Date().toISOString()}: ${exception.message}\r\n${exception.name}\r\n${exception.stack}\r\n`;
      fs.appendFileSync(filePath, contents, 'utf8');
    } catch {
      // Silently ignore logging errors
    }
  }
}
