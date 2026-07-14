/**
 * IFileSystem — abstraction over file system operations.
 *
 * All TranslatorEngine file I/O goes through this interface,
 * making it possible to swap implementations (e.g., Node.js fs,
 * browser fs via adapter, or a mock for unit testing).
 */
export interface IFileSystem {
  /** Check if a path exists. */
  existsSync(path: string): boolean;

  /** Read entire file as string. */
  readFileSync(path: string, encoding?: string): string;

  /** Write string content to a file (overwrites). */
  writeFileSync(path: string, data: string, encoding?: string): void;

  /** Append string content to a file. */
  appendFileSync(path: string, data: string, encoding?: string): void;

  /** Copy a file from src to dest. */
  copyFileSync(src: string, dest: string): void;

  /** Delete a file. */
  unlinkSync(path: string): void;

  /** Get file stats (used to check size). */
  statSync(path: string): { size: number };

  /** Open a file descriptor. */
  openSync(path: string, flags: string): number;

  /** Read bytes from a file descriptor into a buffer. */
  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number): number;

  /** Close a file descriptor. */
  closeSync(fd: number): void;

  // ── Path helpers (purely functional, included for convenience) ──

  /** Join path segments. */
  join(...paths: string[]): string;

  /** Get directory name of a path. */
  dirname(path: string): string;

  /** Get file name with optional extension stripped. */
  basename(path: string, ext?: string): string;

  /** Get file extension. */
  extname(path: string): string;

  /** Check if a path is absolute. */
  isAbsolute(path: string): boolean;
}
