import { IFileSystem } from '../io/IFileSystem';
import { FileSystemConfig } from '../io/FileSystemConfig';

/**
 * Reads and caches `Dictionaries.config` to resolve dictionary file paths.
 * Also exposes algorithm-selection flags (ThuatToanNhan) from the config.
 *
 * Config file format (key=value, # comments):
 *   VietPhrase=path/to/vietphrase.txt
 *   ThuatToanNhan=1
 *
 * Uses FileSystemConfig.instance for file I/O.
 */
export class DictionaryConfigurationHelper {
  private static directoryPath: string = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '/';
  private static thuatToanNhan: string = '';

  private static configCache: Map<string, string> | null = null;

  private static get fs(): IFileSystem {
    return FileSystemConfig.instance;
  }

  private static loadConfig(): Map<string, string> {
    if (this.configCache) {
      return this.configCache;
    }

    const configPath = this.fs.join(this.directoryPath, 'Dictionaries.config');
    const config = new Map<string, string>();

    try {
      const lines = this.fs.readFileSync(configPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            config.set(trimmed.substring(0, eqIdx), trimmed.substring(eqIdx + 1));
          }
        }
      }
    } catch {
      // Config file not found
    }

    this.configCache = config;
    return config;
  }

  /** Set the base directory where Dictionaries.config lives. */
  static setDirectoryPath(dirPath: string): void {
    this.directoryPath = dirPath;
    this.configCache = null;
  }

  static get IsNhanByPronouns(): boolean {
    if (!this.thuatToanNhan) {
      this.readThuatToanNhan();
    }
    return this.thuatToanNhan === '1';
  }

  static get IsNhanByPronounsAndNames(): boolean {
    if (!this.thuatToanNhan) {
      this.readThuatToanNhan();
    }
    return this.thuatToanNhan === '2';
  }

  static get IsNhanByPronounsAndNamesAndVietPhrase(): boolean {
    if (!this.thuatToanNhan) {
      this.readThuatToanNhan();
    }
    return this.thuatToanNhan === '3';
  }

  static GetNamesPhuDictionaryPath(): string {
    return this.GetDictionaryPathByKey('NamesPhu');
  }

  static GetNamesDictionaryPath(): string {
    return this.GetDictionaryPathByKey('Names');
  }

  /** Build history file path by inserting "History" before the extension. */
  private static getHistoryPath(dictPath: string): string {
    return this.fs.join(
      this.fs.dirname(dictPath),
      this.fs.basename(dictPath, this.fs.extname(dictPath)) + 'History' + this.fs.extname(dictPath)
    );
  }

  static GetNamesDictionaryHistoryPath(): string {
    return this.getHistoryPath(this.GetNamesDictionaryPath());
  }

  static GetNamesPhuDictionaryHistoryPath(): string {
    return this.getHistoryPath(this.GetNamesPhuDictionaryPath());
  }

  static GetVietPhraseDictionaryPath(): string {
    return this.GetDictionaryPathByKey('VietPhrase');
  }

  static GetVietPhraseDictionaryHistoryPath(): string {
    return this.getHistoryPath(this.GetVietPhraseDictionaryPath());
  }

  static GetChinesePhienAmWordsDictionaryPath(): string {
    return this.GetDictionaryPathByKey('ChinesePhienAmWords');
  }

  static GetChinesePhienAmWordsDictionaryHistoryPath(): string {
    return this.getHistoryPath(this.GetChinesePhienAmWordsDictionaryPath());
  }

  static GetChinesePhienAmEnglishWordsDictionaryPath(): string {
    return this.GetDictionaryPathByKey('ChinesePhienAmEnglishWords');
  }

  static GetCEDictDictionaryPath(): string {
    return this.GetDictionaryPathByKey('CEDict');
  }

  static GetBabylonDictionaryPath(): string {
    return this.GetDictionaryPathByKey('Babylon');
  }

  static GetLacVietDictionaryPath(): string {
    return this.GetDictionaryPathByKey('LacViet');
  }

  static GetThieuChuuDictionaryPath(): string {
    return this.GetDictionaryPathByKey('ThieuChuu');
  }

  static GetIgnoredChinesePhraseListPath(): string {
    return this.GetDictionaryPathByKey('IgnoredChinesePhrases');
  }

  static GetLuatNhanDictionaryPath(): string {
    return this.GetDictionaryPathByKey('LuatNhan');
  }

  static GetPronounsDictionaryPath(): string {
    return this.GetDictionaryPathByKey('Pronouns');
  }

  /**
   * Resolve a dictionary path from Dictionaries.config.
   * Relative paths are resolved against the config directory.
   * Throws if the key is missing or the file doesn't exist.
   */
  private static GetDictionaryPathByKey(dictionaryKey: string): string {
    const config = this.loadConfig();

    if (!config.has(dictionaryKey)) {
      throw new Error(`Dictionary key not found: ${dictionaryKey}`);
    }

    let text = config.get(dictionaryKey)!;

    if (!this.fs.isAbsolute(text)) {
      text = this.fs.join(this.directoryPath, text);
    }

    if (!this.fs.existsSync(text)) {
      throw new Error(`Dictionary Not Found: ${text}`);
    }

    return text;
  }

  private static readThuatToanNhan(): void {
    const config = this.loadConfig();
    this.thuatToanNhan = config.get('ThuatToanNhan') || '';
  }
}
