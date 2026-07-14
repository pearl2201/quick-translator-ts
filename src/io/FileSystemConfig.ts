/**
 * FileSystemConfig — central configuration for the IFileSystem implementation.
 *
 * All classes in the translator engine reference this singleton, so changing
 * the implementation in one place propagates everywhere automatically.
 *
 * @example
 * ```typescript
 * // Default: Node.js fs.  Swap for testing:
 * FileSystemConfig.setInstance(new MockFileSystem());
 *
 * // Or via TranslatorEngine convenience method:
 * TranslatorEngine.configureFileSystem(new MockFileSystem());
 * ```
 */
import { IFileSystem } from './IFileSystem';
import { NodeFileSystem } from './NodeFileSystem';

export class FileSystemConfig {
  /** The shared IFileSystem instance used across the entire engine. */
  private static _instance: IFileSystem = new NodeFileSystem();

  /** Get the current IFileSystem instance. */
  static get instance(): IFileSystem {
    return FileSystemConfig._instance;
  }

  /**
   * Replace the file system implementation.
   * Call this before any file operations to inject a mock or adapter.
   */
  static setInstance(fs: IFileSystem): void {
    FileSystemConfig._instance = fs;
  }

  /** Reset to the default NodeFileSystem. */
  static resetToDefault(): void {
    FileSystemConfig._instance = new NodeFileSystem();
  }
}
