import { CharRange } from './CharRange';
import { DictionaryConfigurationHelper } from './DictionaryConfigurationHelper';
import { ApplicationLog } from './ApplicationLog';
import { IFileSystem } from '../io/IFileSystem';
import { FileSystemConfig } from '../io/FileSystemConfig';

/**
 * TranslatorEngine — Chinese → Vietnamese translation engine.
 *
 * Core capabilities:
 * 1. **Hán-Việt (Han-Viet)**: Character-by-character Chinese → Vietnamese phonetic reading
 * 2. **Việt Phrase (Viet Phrase)**: Multi-character phrase translation with longest-match algorithm
 * 3. **Một Nghĩa (One Meaning)**: Simplified variant that only keeps the first meaning per entry
 * 4. **Luật Nhân (Name/Pronoun Rules)**: Regex-based pattern matching for names/pronouns in context
 * 5. **Multi-dictionary lookup**: Checks Thiều Chửu, Lạc Việt, CC-CEDICT, Babylon, etc.
 * 6. **Input standardization**: Full-width→half-width, CJK punctuation→ASCII, spacing
 * 7. **Dictionary CRUD**: Add/update/delete entries with file persistence and history logging
 *
 * Dictionaries are loaded from text files (key=value per line) configured via Dictionaries.config.
 * Loading uses async parallel Promise.all() for performance.
 *
 * @example
 * ```typescript
 * import { FileSystemConfig } from './io/FileSystemConfig';
 * import { MockFileSystem } from './test/MockFileSystem';
 *
 * // Inject a custom file system (e.g., for testing)
 * TranslatorEngine.configureFileSystem(new MockFileSystem());
 *
 * await TranslatorEngine.LoadDictionaries();
 * const { result } = TranslatorEngine.ChineseToHanViet('中文');
 * console.log(result); // "Trung văn"
 * ```
 */
export class TranslatorEngine {
  /**
   * Configure the file system implementation used by ALL engine classes.
   * Call once at startup to inject a custom IFileSystem (mock, browser adapter, etc.).
   * Delegates to FileSystemConfig.setInstance() so it propagates everywhere.
   */
  static configureFileSystem(fs: IFileSystem): void {
    FileSystemConfig.setInstance(fs);
  }

  /** Convenience accessor for file system operations. */
  private static get fs(): IFileSystem {
    return FileSystemConfig.instance;
  }

  /** Maximum character length for Chinese phrase lookups (sliding window). */
  public static readonly CHINESE_LOOKUP_MAX_LENGTH = 20;

  /** When true, dictionaries will be re-loaded from disk on next LoadDictionaries(). */
  private static dictionaryDirty = true;

  // ── In-memory dictionaries ──
  // All are keyed by Chinese text, valued by Vietnamese translation(s).
  private static hanVietDictionary = new Map<string, string>();               // Hán-Việt (character-level)
  private static vietPhraseDictionary = new Map<string, string>();             // Combined phrase + name
  private static thieuChuuDictionary = new Map<string, string>();              // Thiều Chửu dictionary
  private static lacVietDictionary = new Map<string, string>();                // Lạc Việt dictionary
  private static cedictDictionary = new Map<string, string>();                 // CC-CEDICT + Babylon
  private static chinesePhienAmEnglishDictionary = new Map<string, string>();  // English phonetics
  private static vietPhraseOneMeaningDictionary = new Map<string, string>();   // First meaning only (phrase)
  private static onlyVietPhraseDictionary = new Map<string, string>();         // Phrase-only (no names)
  private static onlyNameDictionary = new Map<string, string>();               // Combined name entries
  private static onlyNameOneMeaningDictionary = new Map<string, string>();     // First meaning only (names)
  private static onlyNameChinhDictionary = new Map<string, string>();          // Main name dictionary
  private static onlyNamePhuDictionary = new Map<string, string>();            // Secondary name dictionary
  private static luatNhanDictionary = new Map<string, string>();               // Luật Nhân (name rules)
  private static pronounDictionary = new Map<string, string>();                // Pronoun dictionary
  private static pronounOneMeaningDictionary = new Map<string, string>();      // Pronoun (first meaning)

  /** Runtime-selected dictionary for "nhân" (person/name) rules, based on config. */
  private static nhanByDictionary: Map<string, string> | null = null;
  private static nhanByOneMeaningDictionary: Map<string, string> | null = null;

  // ── History tracking ──
  // Maps entry key → { action, userName, updatedDate }
  private static onlyVietPhraseDictionaryHistoryDataSet = new Map<string, { action: string; userName: string; updatedDate: Date }>();
  private static onlyNameDictionaryHistoryDataSet = new Map<string, { action: string; userName: string; updatedDate: Date }>();
  private static onlyNamePhuDictionaryHistoryDataSet = new Map<string, { action: string; userName: string; updatedDate: Date }>();
  private static hanVietDictionaryHistoryDataSet = new Map<string, { action: string; userName: string; updatedDate: Date }>();

  /** Phrases to skip during translation (e.g., ads, boilerplate). */
  private static ignoredChinesePhraseList: string[] = [];
  private static ignoredChinesePhraseForBrowserList: string[] = [];

  /** Synchronization object for LoadDictionaries(). */
  private static lockObject = {};

  /** Null sentinel character used during standardization. */
  private static NULL_STRING = '\0';

  /** Tracks the last translated word for context-aware capitalization. */
  public static LastTranslatedWord_HanViet = '';
  public static LastTranslatedWord_VietPhrase = '';
  public static LastTranslatedWord_VietPhraseOneMeaning = '';

  private static trimCharsForAnalyzer = [' ', '\n', '\t'];

  public static get DictionaryDirty(): boolean {
    return TranslatorEngine.dictionaryDirty;
  }

  public static set DictionaryDirty(value: boolean) {
    TranslatorEngine.dictionaryDirty = value;
  }

  // ── Dictionary CRUD & helpers ─────────────────────────────────────────

  /** Lookup a key in the combined VietPhrase + Name dictionary. Returns null if not found. */
  public static GetVietPhraseOrNameValueFromKey(key: string): string | null {
    if (!TranslatorEngine.vietPhraseDictionary.has(key)) {
      return null;
    }
    return TranslatorEngine.vietPhraseDictionary.get(key)!;
  }

  /** Lookup a key in the phrase-only dictionary. Returns null if not found. */
  public static GetVietPhraseValueFromKey(key: string): string | null {
    if (!TranslatorEngine.onlyVietPhraseDictionary.has(key)) {
      return null;
    }
    return TranslatorEngine.onlyVietPhraseDictionary.get(key)!;
  }

  /**
   * Lookup a key in the name dictionary.
   * @param isNameChinh - true = main name dictionary; false = secondary name dictionary; omit = combined
   */
  public static GetNameValueFromKey(key: string, isNameChinh?: boolean): string | null {
    if (isNameChinh === undefined) {
      if (!TranslatorEngine.onlyNameDictionary.has(key)) {
        return null;
      }
      return TranslatorEngine.onlyNameDictionary.get(key)!;
    }

    const dictionary = isNameChinh ? TranslatorEngine.onlyNameChinhDictionary : TranslatorEngine.onlyNamePhuDictionary;
    if (!dictionary.has(key)) {
      return null;
    }
    return dictionary.get(key)!;
  }

  public static DeleteKeyFromVietPhraseDictionary(key: string, sorting: boolean): void {
    TranslatorEngine.vietPhraseDictionary.delete(key);
    TranslatorEngine.vietPhraseOneMeaningDictionary.delete(key);
    TranslatorEngine.onlyVietPhraseDictionary.delete(key);
    if (sorting) {
      TranslatorEngine.SaveDictionaryToFile(TranslatorEngine.onlyVietPhraseDictionary, DictionaryConfigurationHelper.GetVietPhraseDictionaryPath());
    } else {
      TranslatorEngine.SaveDictionaryToFileWithoutSorting(TranslatorEngine.onlyVietPhraseDictionary, DictionaryConfigurationHelper.GetVietPhraseDictionaryPath());
    }
    TranslatorEngine.writeVietPhraseHistoryLog(key, 'Deleted');
  }

  public static DeleteKeyFromNameDictionary(key: string, sorting: boolean, isNameChinh: boolean): void {
    TranslatorEngine.vietPhraseDictionary.delete(key);
    TranslatorEngine.vietPhraseOneMeaningDictionary.delete(key);
    TranslatorEngine.onlyNameDictionary.delete(key);
    TranslatorEngine.onlyNameOneMeaningDictionary.delete(key);
    const dictionary = isNameChinh ? TranslatorEngine.onlyNameChinhDictionary : TranslatorEngine.onlyNamePhuDictionary;
    if (!dictionary.has(key)) {
      return;
    }
    dictionary.delete(key);
    if (sorting) {
      TranslatorEngine.SaveDictionaryToFile(dictionary, isNameChinh ? DictionaryConfigurationHelper.GetNamesDictionaryPath() : DictionaryConfigurationHelper.GetNamesPhuDictionaryPath());
    } else {
      TranslatorEngine.SaveDictionaryToFileWithoutSorting(dictionary, isNameChinh ? DictionaryConfigurationHelper.GetNamesDictionaryPath() : DictionaryConfigurationHelper.GetNamesPhuDictionaryPath());
    }
    TranslatorEngine.writeNamesHistoryLog(key, 'Deleted', isNameChinh);
  }

  public static DeleteKeyFromPhienAmDictionary(key: string, sorting: boolean): void {
    TranslatorEngine.hanVietDictionary.delete(key);
    if (sorting) {
      TranslatorEngine.SaveDictionaryToFile(TranslatorEngine.hanVietDictionary, DictionaryConfigurationHelper.GetChinesePhienAmWordsDictionaryPath());
    } else {
      TranslatorEngine.SaveDictionaryToFileWithoutSorting(TranslatorEngine.hanVietDictionary, DictionaryConfigurationHelper.GetChinesePhienAmWordsDictionaryPath());
    }
    TranslatorEngine.writePhienAmHistoryLog(key, 'Deleted');
  }

  public static UpdateVietPhraseDictionary(key: string, value: string, sorting: boolean): void {
    if (TranslatorEngine.vietPhraseDictionary.has(key)) {
      TranslatorEngine.vietPhraseDictionary.set(key, value);
    } else {
      TranslatorEngine.vietPhraseDictionary.set(key, value);
    }

    const firstMeaning = value.split(/[\/|]/)[0];
    if (TranslatorEngine.vietPhraseOneMeaningDictionary.has(key)) {
      TranslatorEngine.vietPhraseOneMeaningDictionary.set(key, firstMeaning);
    } else {
      TranslatorEngine.vietPhraseOneMeaningDictionary.set(key, firstMeaning);
    }

    if (TranslatorEngine.onlyVietPhraseDictionary.has(key)) {
      TranslatorEngine.onlyVietPhraseDictionary.set(key, value);
      TranslatorEngine.writeVietPhraseHistoryLog(key, 'Updated');
    } else {
      if (sorting) {
        TranslatorEngine.onlyVietPhraseDictionary.set(key, value);
      } else {
        TranslatorEngine.onlyVietPhraseDictionary = TranslatorEngine.AddEntryToDictionaryWithoutSorting(TranslatorEngine.onlyVietPhraseDictionary, key, value);
      }
      TranslatorEngine.writeVietPhraseHistoryLog(key, 'Added');
    }

    if (sorting) {
      TranslatorEngine.SaveDictionaryToFile(TranslatorEngine.onlyVietPhraseDictionary, DictionaryConfigurationHelper.GetVietPhraseDictionaryPath());
    } else {
      TranslatorEngine.SaveDictionaryToFileWithoutSorting(TranslatorEngine.onlyVietPhraseDictionary, DictionaryConfigurationHelper.GetVietPhraseDictionaryPath());
    }
  }

  private static AddEntryToDictionaryWithoutSorting(dictionary: Map<string, string>, key: string, value: string): Map<string, string> {
    const newDict = new Map<string, string>();
    for (const [k, v] of dictionary) {
      newDict.set(k, v);
    }
    newDict.set(key, value);
    return newDict;
  }

  public static UpdateNameDictionary(key: string, value: string, sorting: boolean, isNameChinh: boolean): void {
    if (TranslatorEngine.vietPhraseDictionary.has(key)) {
      TranslatorEngine.vietPhraseDictionary.set(key, value);
    } else {
      TranslatorEngine.vietPhraseDictionary.set(key, value);
    }

    const firstMeaning = value.split(/[\/|]/)[0];
    if (TranslatorEngine.vietPhraseOneMeaningDictionary.has(key)) {
      TranslatorEngine.vietPhraseOneMeaningDictionary.set(key, firstMeaning);
    } else {
      TranslatorEngine.vietPhraseOneMeaningDictionary.set(key, firstMeaning);
    }

    let dictionary = isNameChinh ? TranslatorEngine.onlyNameChinhDictionary : TranslatorEngine.onlyNamePhuDictionary;

    if (dictionary.has(key)) {
      dictionary.set(key, value);
      TranslatorEngine.writeNamesHistoryLog(key, 'Updated', isNameChinh);
    } else {
      if (sorting) {
        dictionary.set(key, value);
      } else if (isNameChinh) {
        TranslatorEngine.onlyNameChinhDictionary = TranslatorEngine.AddEntryToDictionaryWithoutSorting(TranslatorEngine.onlyNameChinhDictionary, key, value);
        dictionary = TranslatorEngine.onlyNameChinhDictionary;
      } else {
        TranslatorEngine.onlyNamePhuDictionary = TranslatorEngine.AddEntryToDictionaryWithoutSorting(TranslatorEngine.onlyNamePhuDictionary, key, value);
        dictionary = TranslatorEngine.onlyNamePhuDictionary;
      }
      TranslatorEngine.writeNamesHistoryLog(key, 'Added', isNameChinh);
    }

    if (TranslatorEngine.onlyNameDictionary.has(key)) {
      TranslatorEngine.onlyNameDictionary.set(key, value);
      TranslatorEngine.onlyNameOneMeaningDictionary.set(key, firstMeaning);
    } else if (sorting) {
      TranslatorEngine.onlyNameDictionary.set(key, value);
      TranslatorEngine.onlyNameOneMeaningDictionary.set(key, firstMeaning);
    } else {
      TranslatorEngine.onlyNameDictionary = TranslatorEngine.AddEntryToDictionaryWithoutSorting(TranslatorEngine.onlyNameDictionary, key, value);
      TranslatorEngine.onlyNameOneMeaningDictionary = TranslatorEngine.AddEntryToDictionaryWithoutSorting(TranslatorEngine.onlyNameOneMeaningDictionary, key, firstMeaning);
    }

    if (sorting) {
      TranslatorEngine.SaveDictionaryToFile(dictionary, isNameChinh ? DictionaryConfigurationHelper.GetNamesDictionaryPath() : DictionaryConfigurationHelper.GetNamesPhuDictionaryPath());
    } else {
      TranslatorEngine.SaveDictionaryToFileWithoutSorting(dictionary, isNameChinh ? DictionaryConfigurationHelper.GetNamesDictionaryPath() : DictionaryConfigurationHelper.GetNamesPhuDictionaryPath());
    }
  }

  public static UpdatePhienAmDictionary(key: string, value: string, sorting: boolean): void {
    if (TranslatorEngine.hanVietDictionary.has(key)) {
      TranslatorEngine.hanVietDictionary.set(key, value);
      TranslatorEngine.writePhienAmHistoryLog(key, 'Updated');
    } else {
      if (sorting) {
        TranslatorEngine.hanVietDictionary.set(key, value);
      } else {
        TranslatorEngine.hanVietDictionary = TranslatorEngine.AddEntryToDictionaryWithoutSorting(TranslatorEngine.hanVietDictionary, key, value);
      }
      TranslatorEngine.writePhienAmHistoryLog(key, 'Added');
    }

    if (sorting) {
      TranslatorEngine.SaveDictionaryToFile(TranslatorEngine.hanVietDictionary, DictionaryConfigurationHelper.GetChinesePhienAmWordsDictionaryPath());
    } else {
      TranslatorEngine.SaveDictionaryToFileWithoutSorting(TranslatorEngine.hanVietDictionary, DictionaryConfigurationHelper.GetChinesePhienAmWordsDictionaryPath());
    }
  }

  public static SaveDictionaryToFileWithoutSorting(dictionary: Map<string, string>, filePath: string): void {
    const backupPath = filePath + '.' + Date.now();
    if (TranslatorEngine.fs.existsSync(filePath)) {
      TranslatorEngine.fs.copyFileSync(filePath, backupPath);
    }

    let content = '';
    for (const [key, value] of dictionary) {
      content += key + '=' + value + '\r\n';
    }

    try {
      TranslatorEngine.fs.writeFileSync(filePath, content, 'utf8');
    } catch (ex: any) {
      try {
        TranslatorEngine.fs.copyFileSync(backupPath, filePath);
      } catch {
        // silently ignore
      }
      throw ex;
    }

    if (TranslatorEngine.fs.existsSync(filePath)) {
      try {
        TranslatorEngine.fs.unlinkSync(backupPath);
      } catch {
        // silently ignore
      }
    }
  }

  public static SaveDictionaryToFile(dictionary: Map<string, string>, filePath: string): void {
    const sortedPairs = Array.from(dictionary.entries()).sort((a, b) => {
      // order by key length descending, then by key
      if (b[0].length !== a[0].length) {
        return b[0].length - a[0].length;
      }
      return a[0].localeCompare(b[0]);
    });

    const newDictionary = new Map<string, string>(sortedPairs);

    // Clear and re-populate the original map to preserve reference
    dictionary.clear();
    for (const [k, v] of newDictionary) {
      dictionary.set(k, v);
    }

    const backupPath = filePath + '.' + Date.now();
    if (TranslatorEngine.fs.existsSync(filePath)) {
      TranslatorEngine.fs.copyFileSync(filePath, backupPath);
    }

    let content = '';
    for (const [key, value] of sortedPairs) {
      content += key + '=' + value + '\r\n';
    }

    try {
      TranslatorEngine.fs.writeFileSync(filePath, content, 'utf8');
    } catch (ex: any) {
      try {
        TranslatorEngine.fs.copyFileSync(backupPath, filePath);
      } catch {
        // silently ignore
      }
      throw ex;
    }

    if (TranslatorEngine.fs.existsSync(filePath)) {
      try {
        TranslatorEngine.fs.unlinkSync(backupPath);
      } catch {
        // silently ignore
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  TRANSLATION ENGINES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Character-by-character Chinese → Han-Vietnamese phonetic translation.
   * Each Chinese character is looked up in the hanVietDictionary.
   * Returns translated text and CharRange[] mapping input positions to output positions.
   */
  public static ChineseToHanViet(chinese: string): { result: string; mapping: CharRange[] } {
    TranslatorEngine.LastTranslatedWord_HanViet = '';
    const mappingList: CharRange[] = [];
    const sb: string[] = [];
    const length = chinese.length;

    for (let i = 0; i < length - 1; i++) {
      const currentPos = sb.reduce((sum, part) => sum + part.length, 0);
      const c = chinese[i];
      const nextChar = chinese[i + 1];
      const hanVietOfC = TranslatorEngine._ChineseToHanVietChar(c);

      if (TranslatorEngine.isChinese(c)) {
        if (TranslatorEngine.isChinese(nextChar)) {
          TranslatorEngine.appendTranslatedWord(sb, hanVietOfC, currentPos);
          sb.push(' ');
          TranslatorEngine.LastTranslatedWord_HanViet += ' ';
          mappingList.push(new CharRange(currentPos, hanVietOfC.length));
        } else {
          TranslatorEngine.appendTranslatedWord(sb, hanVietOfC, currentPos);
          mappingList.push(new CharRange(currentPos, hanVietOfC.length));
        }
      } else {
        sb.push(c);
        TranslatorEngine.LastTranslatedWord_HanViet += c;
        mappingList.push(new CharRange(currentPos, 1));
      }
    }

    if (TranslatorEngine.isChinese(chinese[length - 1])) {
      const hanVietOfLast = TranslatorEngine._ChineseToHanVietChar(chinese[length - 1]);
      const pos = sb.reduce((sum, part) => sum + part.length, 0);
      TranslatorEngine.appendTranslatedWord(sb, hanVietOfLast);
      mappingList.push(new CharRange(pos, hanVietOfLast.length));
    } else {
      const pos = sb.reduce((sum, part) => sum + part.length, 0);
      sb.push(chinese[length - 1]);
      TranslatorEngine.LastTranslatedWord_HanViet += chinese[length - 1];
      mappingList.push(new CharRange(pos, 1));
    }

    TranslatorEngine.LastTranslatedWord_HanViet = '';
    return { result: sb.join(''), mapping: mappingList };
  }

  /**
   * Translates Chinese text to Han-Viet for the browser.
   * Handles mixed Latin and Chinese input.
   */
  public static ChineseToHanVietForBrowser(chinese: string): string {
    if (!chinese) {
      return '';
    }

    chinese = TranslatorEngine.StandardizeInputForBrowser(chinese);
    const sb: string[] = [];
    const words = TranslatorEngine.classifyWordsIntoLatinAndChinese(chinese);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word) {
        let translated: string;
        if (TranslatorEngine.isChinese(word[0])) {
          const result = TranslatorEngine.ChineseToHanViet(word);
          translated = result.result.trimStart();
          if (i === 0 || !words[i - 1].endsWith(', ')) {
            translated = TranslatorEngine.toUpperCase(translated);
          }
        } else {
          translated = word;
        }
        sb.push(translated);
      }
    }

    return sb.join('');
  }

  // ===================================================================
  // Helper methods (replacing stubs)
  // ===================================================================

  private static isChinese(c: string): boolean {
    return TranslatorEngine.hanVietDictionary.has(c);
  }

  public static IsChineseChar(character: string): boolean {
    return TranslatorEngine.isChinese(character);
  }

  public static IsAllChinese(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
      if (!TranslatorEngine.isChinese(text[i])) {
        return false;
      }
    }
    return true;
  }

  private static toUpperCase(text: string): string {
    if (!text) {
      return text;
    }
    if (text.startsWith('[') && text.length >= 2) {
      return '[' + text[1].toUpperCase() + (text.length <= 2 ? '' : text.substring(2));
    }
    return text[0].toUpperCase() + (text.length <= 1 ? '' : text.substring(1));
  }

  private static hasOnlyOneMeaning(meaning: string): boolean {
    return meaning.split(/[\/|]/).length === 1;
  }

  public static ToSimplified(str: string): string {
    return str;
  }

  public static ToWide(str: string): string {
    const length = str.length;
    let i = 0;
    for (; i < length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0x21 && c <= 0x7E) {
        break;
      }
    }
    if (i >= length) {
      return str;
    }
    const sb: string[] = [];
    for (i = 0; i < length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0x21 && c <= 0x7E) {
        sb.push(String.fromCharCode(c - 0x21 + 0xFF01));
      } else {
        sb.push(str[i]);
      }
    }
    return sb.join('');
  }

  public static ToNarrow(str: string): string {
    const length = str.length;
    let i = 0;
    for (; i < length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0xFF01 && c <= 0xFF5E) {
        break;
      }
    }
    if (i >= length) {
      return str;
    }
    const sb: string[] = [];
    for (i = 0; i < length; i++) {
      const c = str.charCodeAt(i);
      if (c >= 0xFF01 && c <= 0xFF5E) {
        sb.push(String.fromCharCode(c - 0xFF01 + 0x21));
      } else {
        sb.push(str[i]);
      }
    }
    return sb.join('');
  }

  private static nextCharIsChinese(chinese: string, currentPhraseEndIndex: number): boolean {
    return chinese.length - 1 > currentPhraseEndIndex && TranslatorEngine.isChinese(chinese[currentPhraseEndIndex + 1]);
  }

  /**
   * appendTranslatedWord - 3-arg overload used by existing ChineseToHanViet
   * Simply pushes the word to the string array.
   */
  private static appendTranslatedWord(sb: string[], word: string, _currentPos?: number): void {
    sb.push(word);
  }

  /**
   * appendTranslatedWord tracking - full C# logic with lastTranslatedWord tracking.
   * Returns the updated lastTranslatedWord string.
   */
  private static appendTranslatedWordWithTrack(sb: string[], word: string, lastTranslatedWord: string): string {
    let result: string;
    if (lastTranslatedWord.endsWith('\n') || lastTranslatedWord.endsWith('\t') ||
        lastTranslatedWord.endsWith('. ') || lastTranslatedWord.endsWith('"') ||
        lastTranslatedWord.endsWith("'") || lastTranslatedWord.endsWith('? ') ||
        lastTranslatedWord.endsWith('! ') || lastTranslatedWord.endsWith('." ') ||
        lastTranslatedWord.endsWith('?" ') || lastTranslatedWord.endsWith('!" ') ||
        lastTranslatedWord.endsWith(': ')) {
      result = TranslatorEngine.toUpperCase(word);
    } else if (lastTranslatedWord.endsWith(' ') || lastTranslatedWord.endsWith('(')) {
      result = word;
    } else {
      result = ' ' + word;
    }

    if ((!word || word[0] === ',' || word[0] === '.' || word[0] === '?' || word[0] === '!') &&
        0 < sb.length) {
      const lastIdx = sb.length - 1;
      const lastStr = sb[lastIdx];
      if (lastStr.endsWith(' ')) {
        sb[lastIdx] = lastStr.slice(0, -1);
      }
    }

    sb.push(result);
    return result;
  }

  private static _ChineseToHanVietChar(c: string): string {
    if (c === ' ') {
      return '';
    }
    if (!TranslatorEngine.hanVietDictionary.has(c)) {
      return TranslatorEngine.ToNarrow(c);
    }
    return TranslatorEngine.hanVietDictionary.get(c)!;
  }

  /**
   * Single char Han-Viet lookup (public, matches C# ChineseToHanViet(char))
   */
  public static ChineseToHanVietChar(chinese: string): string {
    return TranslatorEngine._ChineseToHanVietChar(chinese);
  }

  // ===================================================================
  // ChineseToHanVietForBatch
  // ===================================================================

  public static ChineseToHanVietForBatch(chinese: string): string {
    let str = '';
    const sb: string[] = [];
    const length = chinese.length;
    for (let i = 0; i < length - 1; i++) {
      const c = chinese[i];
      const character = chinese[i + 1];
      if (TranslatorEngine.isChinese(c)) {
        if (TranslatorEngine.isChinese(character)) {
          TranslatorEngine.appendTranslatedWord(sb, TranslatorEngine._ChineseToHanVietChar(c));
          sb.push(' ');
          str += ' ';
        } else {
          TranslatorEngine.appendTranslatedWord(sb, TranslatorEngine._ChineseToHanVietChar(c));
        }
      } else {
        sb.push(c);
        str += c;
      }
    }
    if (TranslatorEngine.isChinese(chinese[length - 1])) {
      TranslatorEngine.appendTranslatedWord(sb, TranslatorEngine._ChineseToHanVietChar(chinese[length - 1]));
    } else {
      sb.push(chinese[length - 1]);
      str += chinese[length - 1];
    }
    return sb.join('');
  }

  // ===================================================================
  // ChineseToVietPhrase (main translation algorithm)
  // ===================================================================

  /**
   * Main phrase translation using longest-match sliding-window algorithm (max 20 chars).
   * @param wrapType - 0=no brackets, 1=wrap all in [...], other=auto-wrap multi-meaning only
   * @param translationAlgorithm - 0=default (longest match), 2=alternative variant
   * @param prioritizedName - true=prefer name dictionary over phrase dictionary
   * @returns translated text and CharRange[] arrays for Chinese/Vietnamese position mapping
   */
  public static ChineseToVietPhrase(
    chinese: string,
    wrapType: number,
    translationAlgorithm: number,
    prioritizedName: boolean
  ): { result: string; chinesePhraseRanges: CharRange[]; vietPhraseRanges: CharRange[] } {
    TranslatorEngine.LastTranslatedWord_VietPhrase = '';
    const chinesePhraseRangesList: CharRange[] = [];
    const vietPhraseRangesList: CharRange[] = [];
    const sb: string[] = [];
    const num = chinese.length - 1;
    let i = 0;
    let num2 = -1;
    let num3 = -1;
    let num4 = -1;
    TranslatorEngine.loadNhanByDictionary();

    while (i <= num) {
      let flag = false;
      let flag2 = true;

      for (let j = 20; j > 0; j--) {
        if (chinese.length >= i + j) {
          if (TranslatorEngine.vietPhraseDictionary.has(chinese.substring(i, i + j))) {
            if ((!prioritizedName || !TranslatorEngine.containsName(chinese, i, j)) &&
                ((translationAlgorithm !== 0 && translationAlgorithm !== 2) ||
                 TranslatorEngine.isLongestPhraseInSentence(chinese, i, j, TranslatorEngine.vietPhraseDictionary, translationAlgorithm) ||
                 (prioritizedName && TranslatorEngine.onlyNameDictionary.has(chinese.substring(i, i + j))))) {

              chinesePhraseRangesList.push(new CharRange(i, j));
              const dictVal = TranslatorEngine.vietPhraseDictionary.get(chinese.substring(i, i + j))!;

              if (wrapType === 0) {
                TranslatorEngine.LastTranslatedWord_VietPhrase =
                  TranslatorEngine.appendTranslatedWordWithTrack(sb, dictVal, TranslatorEngine.LastTranslatedWord_VietPhrase);
                vietPhraseRangesList.push(new CharRange(sb.join('').length - dictVal.length, dictVal.length));
              } else if (wrapType === 1 || wrapType === 11) {
                const wrapped = '[' + dictVal + ']';
                TranslatorEngine.LastTranslatedWord_VietPhrase =
                  TranslatorEngine.appendTranslatedWordWithTrack(sb, wrapped, TranslatorEngine.LastTranslatedWord_VietPhrase);
                vietPhraseRangesList.push(new CharRange(sb.join('').length - wrapped.length, wrapped.length));
              } else if (TranslatorEngine.hasOnlyOneMeaning(dictVal)) {
                TranslatorEngine.LastTranslatedWord_VietPhrase =
                  TranslatorEngine.appendTranslatedWordWithTrack(sb, dictVal, TranslatorEngine.LastTranslatedWord_VietPhrase);
                vietPhraseRangesList.push(new CharRange(sb.join('').length - dictVal.length, dictVal.length));
              } else {
                const wrapped = '[' + dictVal + ']';
                TranslatorEngine.LastTranslatedWord_VietPhrase =
                  TranslatorEngine.appendTranslatedWordWithTrack(sb, wrapped, TranslatorEngine.LastTranslatedWord_VietPhrase);
                vietPhraseRangesList.push(new CharRange(sb.join('').length - wrapped.length, wrapped.length));
              }

              if (TranslatorEngine.nextCharIsChinese(chinese, i + j - 1)) {
                sb.push(' ');
                TranslatorEngine.LastTranslatedWord_VietPhrase += ' ';
              }
              flag = true;
              i += j;
              break;
            }
          } else if (!chinese.substring(i, i + j).includes('\n') &&
                     !chinese.substring(i, i + j).includes('\t') &&
                     TranslatorEngine.nhanByDictionary !== null &&
                     flag2 && 2 < j && num2 < i + j - 1 &&
                     TranslatorEngine.IsAllChinese(chinese.substring(i, i + j))) {

            if (i < num3) {
              if (num3 < i + j && j <= num4 - num3) {
                j = num3 - i + 1;
              }
            } else {
              let empty = '';
              let num5 = -1;
              const containsResult = TranslatorEngine.containsLuatNhan(chinese.substring(i, i + j), TranslatorEngine.nhanByDictionary!);
              let num6: number;
              let matchedStr: string;
              if (typeof containsResult === 'object') {
                num6 = containsResult.index;
                matchedStr = containsResult.matchedStr!;
                num5 = containsResult.matchedLength!;
              } else {
                num6 = containsResult;
                matchedStr = '';
                num5 = -1;
              }
              num3 = i + num6;
              num4 = num3 + num5;

              if (num6 === 0) {
                if (TranslatorEngine.isLongestPhraseInSentence(chinese, i - 1, num5 - 1, TranslatorEngine.vietPhraseOneMeaningDictionary, translationAlgorithm)) {
                  j = num5;
                  const text = TranslatorEngine.ChineseToLuatNhan(chinese.substring(i, i + j), TranslatorEngine.nhanByDictionary!);

                  chinesePhraseRangesList.push(new CharRange(i, j));
                  if (wrapType === 0) {
                    TranslatorEngine.LastTranslatedWord_VietPhrase =
                      TranslatorEngine.appendTranslatedWordWithTrack(sb, text, TranslatorEngine.LastTranslatedWord_VietPhrase);
                    vietPhraseRangesList.push(new CharRange(sb.join('').length - text.length, text.length));
                  } else if (wrapType === 1 || wrapType === 11) {
                    const wrapped = '[' + text + ']';
                    TranslatorEngine.LastTranslatedWord_VietPhrase =
                      TranslatorEngine.appendTranslatedWordWithTrack(sb, wrapped, TranslatorEngine.LastTranslatedWord_VietPhrase);
                    vietPhraseRangesList.push(new CharRange(sb.join('').length - wrapped.length, wrapped.length));
                  } else if (TranslatorEngine.hasOnlyOneMeaning(text)) {
                    TranslatorEngine.LastTranslatedWord_VietPhrase =
                      TranslatorEngine.appendTranslatedWordWithTrack(sb, text, TranslatorEngine.LastTranslatedWord_VietPhrase);
                    vietPhraseRangesList.push(new CharRange(sb.join('').length - text.length, text.length));
                  } else {
                    const wrapped = '[' + text + ']';
                    TranslatorEngine.LastTranslatedWord_VietPhrase =
                      TranslatorEngine.appendTranslatedWordWithTrack(sb, wrapped, TranslatorEngine.LastTranslatedWord_VietPhrase);
                    vietPhraseRangesList.push(new CharRange(sb.join('').length - wrapped.length, wrapped.length));
                  }

                  if (TranslatorEngine.nextCharIsChinese(chinese, i + j - 1)) {
                    sb.push(' ');
                    TranslatorEngine.LastTranslatedWord_VietPhrase += ' ';
                  }
                  flag = true;
                  i += j;
                  break;
                }
              } else if (num6 <= 0) {
                num2 = i + j - 1;
                flag2 = false;
                let num7 = 100;
                while (i + num7 < chinese.length && TranslatorEngine.isChinese(chinese[i + num7 - 1])) {
                  num7++;
                }
                if (i + num7 <= chinese.length) {
                  const containsResult2 = TranslatorEngine.containsLuatNhan(chinese.substring(i, i + num7), TranslatorEngine.nhanByDictionary!);
                  let num6b: number;
                  if (typeof containsResult2 === 'object') {
                    num6b = containsResult2.index;
                  } else {
                    num6b = containsResult2;
                  }
                  if (num6b < 0) {
                    num2 = i + num7 - 1;
                  }
                }
              }
            }
          }
        }
      }

      if (!flag) {
        const length = sb.join('').length;
        let num8 = TranslatorEngine._ChineseToHanVietChar(chinese[i]).length;
        chinesePhraseRangesList.push(new CharRange(i, 1));

        if (TranslatorEngine.isChinese(chinese[i])) {
          const hv = ((wrapType !== 1) ? '' : '[') + TranslatorEngine._ChineseToHanVietChar(chinese[i]) + ((wrapType !== 1) ? '' : ']');
          TranslatorEngine.LastTranslatedWord_VietPhrase =
            TranslatorEngine.appendTranslatedWordWithTrack(sb, hv, TranslatorEngine.LastTranslatedWord_VietPhrase);
          if (TranslatorEngine.nextCharIsChinese(chinese, i)) {
            sb.push(' ');
            TranslatorEngine.LastTranslatedWord_VietPhrase += ' ';
          }
          num8 += (wrapType !== 1) ? 0 : 2;
        } else if ((chinese[i] === '"' || chinese[i] === '\'') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhrase.endsWith(' ') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhrase.endsWith('.') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhrase.endsWith('?') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhrase.endsWith('!') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhrase.endsWith('\t') &&
                   i < chinese.length - 1 &&
                   chinese[i + 1] !== ' ' &&
                   chinese[i + 1] !== ',') {
          sb.push(' ');
          sb.push(chinese[i]);
          TranslatorEngine.LastTranslatedWord_VietPhrase = TranslatorEngine.LastTranslatedWord_VietPhrase + ' ' + chinese[i];
        } else {
          sb.push(chinese[i]);
          TranslatorEngine.LastTranslatedWord_VietPhrase += chinese[i];
          num8 = 1;
        }
        vietPhraseRangesList.push(new CharRange(length, num8));
        i++;
      }
    }

    TranslatorEngine.LastTranslatedWord_VietPhrase = '';
    return {
      result: sb.join(''),
      chinesePhraseRanges: chinesePhraseRangesList,
      vietPhraseRanges: vietPhraseRangesList
    };
  }

  // ===================================================================
  // ChineseToVietPhraseForBrowser
  // ===================================================================

  public static ChineseToVietPhraseForBrowser(chinese: string, wrapType: number, translationAlgorithm: number, prioritizedName: boolean): string {
    chinese = TranslatorEngine.StandardizeInputForBrowser(chinese);
    const sb: string[] = [];
    const words = TranslatorEngine.classifyWordsIntoLatinAndChinese(chinese);

    for (let i = 0; i < words.length; i++) {
      const text = words[i];
      if (text) {
        if (TranslatorEngine.isChinese(text[0])) {
          const result = TranslatorEngine.ChineseToVietPhrase(text, wrapType, translationAlgorithm, prioritizedName);
          sb.push(result.result);
        } else {
          sb.push(text);
        }
      }
    }
    return sb.join('');
  }

  // ===================================================================
  // ChineseToVietPhraseForBatch
  // ===================================================================

  public static ChineseToVietPhraseForBatch(chinese: string, wrapType: number, translationAlgorithm: number, prioritizedName: boolean): string {
    let text = '';
    const sb: string[] = [];
    const num = chinese.length - 1;
    let i = 0;
    let num2 = -1;
    let num3 = -1;
    let num4 = -1;

    while (i <= num) {
      let flag = false;
      let flag2 = true;

      for (let j = 20; j > 0; j--) {
        if (chinese.length >= i + j) {
          if (TranslatorEngine.vietPhraseDictionary.has(chinese.substring(i, i + j))) {
            if ((!prioritizedName || !TranslatorEngine.containsName(chinese, i, j)) &&
                ((translationAlgorithm !== 0 && translationAlgorithm !== 2) ||
                 TranslatorEngine.isLongestPhraseInSentence(chinese, i, j, TranslatorEngine.vietPhraseDictionary, translationAlgorithm) ||
                 (prioritizedName && TranslatorEngine.onlyNameDictionary.has(chinese.substring(i, i + j))))) {

              const dictVal = TranslatorEngine.vietPhraseDictionary.get(chinese.substring(i, i + j))!;
              if (dictVal) {
                if (wrapType === 0) {
                  text = TranslatorEngine.appendTranslatedWordWithTrack(sb, dictVal, text);
                } else if (wrapType === 1 || wrapType === 11) {
                  text = TranslatorEngine.appendTranslatedWordWithTrack(sb, '[' + dictVal + ']', text);
                } else if (TranslatorEngine.hasOnlyOneMeaning(dictVal)) {
                  text = TranslatorEngine.appendTranslatedWordWithTrack(sb, dictVal, text);
                } else {
                  text = TranslatorEngine.appendTranslatedWordWithTrack(sb, '[' + dictVal + ']', text);
                }
                if (TranslatorEngine.nextCharIsChinese(chinese, i + j - 1)) {
                  sb.push(' ');
                  text += ' ';
                }
              }
              flag = true;
              i += j;
              break;
            }
          } else if (!chinese.substring(i, i + j).includes('\n') &&
                     !chinese.substring(i, i + j).includes('\t') &&
                     TranslatorEngine.nhanByDictionary !== null &&
                     flag2 && 2 < j && num2 < i + j - 1 &&
                     TranslatorEngine.IsAllChinese(chinese.substring(i, i + j))) {

            if (i < num3) {
              if (num3 < i + j && j <= num4 - num3) {
                j = num3 - i + 1;
              }
            } else {
              let empty = '';
              let num5 = -1;
              const containsResult = TranslatorEngine.containsLuatNhan(chinese.substring(i, i + j), TranslatorEngine.nhanByDictionary!);
              let num6: number;
              if (typeof containsResult === 'object') {
                num6 = containsResult.index;
                num5 = containsResult.matchedLength!;
              } else {
                num6 = containsResult;
                num5 = -1;
              }
              num3 = i + num6;
              num4 = num3 + num5;

              if (num6 === 0) {
                if (TranslatorEngine.isLongestPhraseInSentence(chinese, i - 1, num5 - 1, TranslatorEngine.vietPhraseOneMeaningDictionary, translationAlgorithm)) {
                  j = num5;
                  const text2 = TranslatorEngine.ChineseToLuatNhan(chinese.substring(i, i + j), TranslatorEngine.nhanByDictionary!);
                  if (wrapType === 0) {
                    text = TranslatorEngine.appendTranslatedWordWithTrack(sb, text2, text);
                  } else if (wrapType === 1 || wrapType === 11) {
                    text = TranslatorEngine.appendTranslatedWordWithTrack(sb, '[' + text2 + ']', text);
                  } else if (TranslatorEngine.hasOnlyOneMeaning(text2)) {
                    text = TranslatorEngine.appendTranslatedWordWithTrack(sb, text2, text);
                  } else {
                    text = TranslatorEngine.appendTranslatedWordWithTrack(sb, '[' + text2 + ']', text);
                  }
                  if (TranslatorEngine.nextCharIsChinese(chinese, i + j - 1)) {
                    sb.push(' ');
                    text += ' ';
                  }
                  flag = true;
                  i += j;
                  break;
                }
              } else if (num6 <= 0) {
                num2 = i + j - 1;
                flag2 = false;
                let num7 = 100;
                while (i + num7 < chinese.length && TranslatorEngine.isChinese(chinese[i + num7 - 1])) {
                  num7++;
                }
                if (i + num7 <= chinese.length) {
                  const containsResult2 = TranslatorEngine.containsLuatNhan(chinese.substring(i, i + num7), TranslatorEngine.nhanByDictionary!);
                  let num6b: number;
                  if (typeof containsResult2 === 'object') {
                    num6b = containsResult2.index;
                  } else {
                    num6b = containsResult2;
                  }
                  if (num6b < 0) {
                    num2 = i + num7 - 1;
                  }
                }
              }
            }
          }
        }
      }

      if (!flag) {
        if (TranslatorEngine.isChinese(chinese[i])) {
          const hv = ((wrapType !== 1) ? '' : '[') + TranslatorEngine._ChineseToHanVietChar(chinese[i]) + ((wrapType !== 1) ? '' : ']');
          text = TranslatorEngine.appendTranslatedWordWithTrack(sb, hv, text);
          if (TranslatorEngine.nextCharIsChinese(chinese, i)) {
            sb.push(' ');
            text += ' ';
          }
        } else if ((chinese[i] === '"' || chinese[i] === '\'') &&
                   !text.endsWith(' ') && !text.endsWith('.') && !text.endsWith('?') &&
                   !text.endsWith('!') && !text.endsWith('\t') &&
                   i < chinese.length - 1 && chinese[i + 1] !== ' ' && chinese[i + 1] !== ',') {
          sb.push(' ');
          sb.push(chinese[i]);
          text = text + ' ' + chinese[i];
        } else {
          sb.push(chinese[i]);
          text += chinese[i];
        }
        i++;
      }
    }
    return sb.join('').replace(/  /g, ' ');
  }

  // ===================================================================
  // ChineseToVietPhraseOneMeaning
  // ===================================================================

  /**
   * Same as ChineseToVietPhrase but uses one-meaning dictionaries (first meaning only).
   * @param wrapType - 0=no brackets, 1=wrap all in [...]
   * @param translationAlgorithm - 0=default, 2=alternative variant
   * @param prioritizedName - true=prefer name dictionary
   */
  public static ChineseToVietPhraseOneMeaning(
    chinese: string,
    wrapType: number,
    translationAlgorithm: number,
    prioritizedName: boolean
  ): { result: string; chinesePhraseRanges: CharRange[]; vietPhraseRanges: CharRange[] } {
    TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning = '';
    const chinesePhraseRangesList: CharRange[] = [];
    const vietPhraseRangesList: CharRange[] = [];
    const sb: string[] = [];
    const num = chinese.length - 1;
    let i = 0;
    let num2 = -1;
    let num3 = -1;
    let num4 = -1;
    TranslatorEngine.loadNhanByOneMeaningDictionary();

    while (i <= num) {
      let flag = false;
      let flag2 = true;

      for (let j = 20; j > 0; j--) {
        if (chinese.length >= i + j) {
          if (TranslatorEngine.vietPhraseOneMeaningDictionary.has(chinese.substring(i, i + j))) {
            if ((!prioritizedName || !TranslatorEngine.containsName(chinese, i, j)) &&
                ((translationAlgorithm !== 0 && translationAlgorithm !== 2) ||
                 TranslatorEngine.isLongestPhraseInSentence(chinese, i, j, TranslatorEngine.vietPhraseOneMeaningDictionary, translationAlgorithm) ||
                 (prioritizedName && TranslatorEngine.onlyNameDictionary.has(chinese.substring(i, i + j))))) {

              chinesePhraseRangesList.push(new CharRange(i, j));
              const dictVal = TranslatorEngine.vietPhraseOneMeaningDictionary.get(chinese.substring(i, i + j))!;

              if (wrapType === 0) {
                TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning =
                  TranslatorEngine.appendTranslatedWordWithTrack(sb, dictVal, TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning);
                vietPhraseRangesList.push(new CharRange(sb.join('').length - dictVal.length, dictVal.length));
              } else {
                const wrapped = '[' + dictVal + ']';
                TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning =
                  TranslatorEngine.appendTranslatedWordWithTrack(sb, wrapped, TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning);
                vietPhraseRangesList.push(new CharRange(sb.join('').length - wrapped.length, wrapped.length));
              }

              if (TranslatorEngine.nextCharIsChinese(chinese, i + j - 1)) {
                sb.push(' ');
                TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning += ' ';
              }
              flag = true;
              i += j;
              break;
            }
          } else if (!chinese.substring(i, i + j).includes('\n') &&
                     !chinese.substring(i, i + j).includes('\t') &&
                     TranslatorEngine.nhanByOneMeaningDictionary !== null &&
                     flag2 && 2 < j && num2 < i + j - 1 &&
                     TranslatorEngine.IsAllChinese(chinese.substring(i, i + j))) {

            if (i < num3) {
              if (num3 < i + j && j <= num4 - num3) {
                j = num3 - i + 1;
              }
            } else {
              let empty = '';
              let num5 = -1;
              const containsResult = TranslatorEngine.containsLuatNhan(chinese.substring(i, i + j), TranslatorEngine.nhanByOneMeaningDictionary!);
              let num6: number;
              if (typeof containsResult === 'object') {
                num6 = containsResult.index;
                num5 = containsResult.matchedLength!;
              } else {
                num6 = containsResult;
                num5 = -1;
              }
              num3 = i + num6;
              num4 = num3 + num5;

              if (num6 === 0) {
                if (TranslatorEngine.isLongestPhraseInSentence(chinese, i - 1, num5 - 1, TranslatorEngine.vietPhraseOneMeaningDictionary, translationAlgorithm)) {
                  j = num5;
                  const text = TranslatorEngine.ChineseToLuatNhan(chinese.substring(i, i + j), TranslatorEngine.nhanByOneMeaningDictionary!);

                  chinesePhraseRangesList.push(new CharRange(i, j));
                  if (wrapType === 0) {
                    TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning =
                      TranslatorEngine.appendTranslatedWordWithTrack(sb, text, TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning);
                    vietPhraseRangesList.push(new CharRange(sb.join('').length - text.length, text.length));
                  } else {
                    const wrapped = '[' + text + ']';
                    TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning =
                      TranslatorEngine.appendTranslatedWordWithTrack(sb, wrapped, TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning);
                    vietPhraseRangesList.push(new CharRange(sb.join('').length - wrapped.length, wrapped.length));
                  }

                  if (TranslatorEngine.nextCharIsChinese(chinese, i + j - 1)) {
                    sb.push(' ');
                    TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning += ' ';
                  }
                  flag = true;
                  i += j;
                  break;
                }
              } else if (num6 <= 0) {
                num2 = i + j - 1;
                flag2 = false;
                let num7 = 100;
                while (i + num7 < chinese.length && TranslatorEngine.isChinese(chinese[i + num7 - 1])) {
                  num7++;
                }
                if (i + num7 <= chinese.length) {
                  const containsResult2 = TranslatorEngine.containsLuatNhan(chinese.substring(i, i + num7), TranslatorEngine.nhanByOneMeaningDictionary!);
                  let num6b: number;
                  if (typeof containsResult2 === 'object') {
                    num6b = containsResult2.index;
                  } else {
                    num6b = containsResult2;
                  }
                  if (num6b < 0) {
                    num2 = i + num7 - 1;
                  }
                }
              }
            }
          }
        }
      }

      if (!flag) {
        const length = sb.join('').length;
        let num8 = TranslatorEngine._ChineseToHanVietChar(chinese[i]).length;
        chinesePhraseRangesList.push(new CharRange(i, 1));

        if (TranslatorEngine.isChinese(chinese[i])) {
          const hv = ((wrapType !== 1) ? '' : '[') + TranslatorEngine._ChineseToHanVietChar(chinese[i]) + ((wrapType !== 1) ? '' : ']');
          TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning =
            TranslatorEngine.appendTranslatedWordWithTrack(sb, hv, TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning);
          if (TranslatorEngine.nextCharIsChinese(chinese, i)) {
            sb.push(' ');
            TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning += ' ';
          }
          num8 += (wrapType !== 1) ? 0 : 2;
        } else if ((chinese[i] === '"' || chinese[i] === '\'') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning.endsWith(' ') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning.endsWith('.') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning.endsWith('?') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning.endsWith('!') &&
                   !TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning.endsWith('\t') &&
                   i < chinese.length - 1 &&
                   chinese[i + 1] !== ' ' &&
                   chinese[i + 1] !== ',') {
          sb.push(' ');
          sb.push(chinese[i]);
          TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning = TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning + ' ' + chinese[i];
        } else {
          sb.push(chinese[i]);
          TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning += chinese[i];
          num8 = 1;
        }
        vietPhraseRangesList.push(new CharRange(length, num8));
        i++;
      }
    }

    TranslatorEngine.LastTranslatedWord_VietPhraseOneMeaning = '';
    return {
      result: sb.join(''),
      chinesePhraseRanges: chinesePhraseRangesList,
      vietPhraseRanges: vietPhraseRangesList
    };
  }

  // ===================================================================
  // ChineseToVietPhraseOneMeaningForBrowser
  // ===================================================================

  public static ChineseToVietPhraseOneMeaningForBrowser(chinese: string, wrapType: number, translationAlgorithm: number, prioritizedName: boolean): string {
    chinese = TranslatorEngine.StandardizeInputForBrowser(chinese);
    const sb: string[] = [];
    const words = TranslatorEngine.classifyWordsIntoLatinAndChinese(chinese);

    for (let i = 0; i < words.length; i++) {
      const text = words[i];
      if (text) {
        let text2: string;
        if (TranslatorEngine.isChinese(text[0])) {
          const result = TranslatorEngine.ChineseToVietPhraseOneMeaning(text, wrapType, translationAlgorithm, prioritizedName);
          text2 = result.result.trimStart();
          if (i === 0 || !words[i - 1].endsWith(', ')) {
            text2 = TranslatorEngine.toUpperCase(text2);
          }
        } else {
          text2 = text;
        }
        sb.push(text2);
      }
    }
    return sb.join('');
  }

  // ===================================================================
  // ChineseToVietPhraseOneMeaningForProxy
  // ===================================================================

  public static ChineseToVietPhraseOneMeaningForProxy(chinese: string, wrapType: number, translationAlgorithm: number, prioritizedName: boolean): string {
    chinese = TranslatorEngine.StandardizeInputForProxy(chinese);
    const sb: string[] = [];
    const words = TranslatorEngine.classifyWordsIntoLatinAndChineseForProxy(chinese);

    for (let i = 0; i < words.length; i++) {
      const text = words[i];
      if (text) {
        if (TranslatorEngine.isChinese(text[0])) {
          const result = TranslatorEngine.ChineseToVietPhraseOneMeaning(text, wrapType, translationAlgorithm, prioritizedName);
          sb.push(result.result);
        } else {
          sb.push(text);
        }
      }
    }
    return sb.join('');
  }

  // ===================================================================
  // ChineseToVietPhraseOneMeaningForBatch
  // ===================================================================

  public static ChineseToVietPhraseOneMeaningForBatch(chinese: string, wrapType: number, translationAlgorithm: number, prioritizedName: boolean): string {
    let text = '';
    const sb: string[] = [];
    const num = chinese.length - 1;
    let i = 0;
    let num2 = -1;
    let num3 = -1;
    let num4 = -1;

    while (i <= num) {
      let flag = false;
      let flag2 = true;

      if (chinese[i] !== '\n' && chinese[i] !== '\t') {
        for (let j = 20; j > 0; j--) {
          if (chinese.length >= i + j) {
            if (TranslatorEngine.vietPhraseOneMeaningDictionary.has(chinese.substring(i, i + j))) {
              if ((!prioritizedName || !TranslatorEngine.containsName(chinese, i, j)) &&
                  ((translationAlgorithm !== 0 && translationAlgorithm !== 2) ||
                   TranslatorEngine.isLongestPhraseInSentence(chinese, i, j, TranslatorEngine.vietPhraseOneMeaningDictionary, translationAlgorithm) ||
                   (prioritizedName && TranslatorEngine.onlyNameDictionary.has(chinese.substring(i, i + j))))) {

                const dictVal = TranslatorEngine.vietPhraseOneMeaningDictionary.get(chinese.substring(i, i + j))!;
                if (dictVal) {
                  if (wrapType === 0) {
                    text = TranslatorEngine.appendTranslatedWordWithTrack(sb, dictVal, text);
                  } else {
                    text = TranslatorEngine.appendTranslatedWordWithTrack(sb, '[' + dictVal + ']', text);
                  }
                  if (TranslatorEngine.nextCharIsChinese(chinese, i + j - 1)) {
                    sb.push(' ');
                    text += ' ';
                  }
                }
                flag = true;
                i += j;
                break;
              }
            } else if (!chinese.substring(i, i + j).includes('\n') &&
                       !chinese.substring(i, i + j).includes('\t') &&
                       TranslatorEngine.nhanByOneMeaningDictionary !== null &&
                       flag2 && 2 < j && num2 < i + j - 1 &&
                       TranslatorEngine.IsAllChinese(chinese.substring(i, i + j))) {

              if (i < num3) {
                if (num3 < i + j && j <= num4 - num3) {
                  j = num3 - i + 1;
                }
              } else {
                let empty = '';
                let num5 = -1;
                const containsResult = TranslatorEngine.containsLuatNhan(chinese.substring(i, i + j), TranslatorEngine.nhanByOneMeaningDictionary!);
                let num6: number;
                if (typeof containsResult === 'object') {
                  num6 = containsResult.index;
                  num5 = containsResult.matchedLength!;
                } else {
                  num6 = containsResult;
                  num5 = -1;
                }
                num3 = i + num6;
                num4 = num3 + num5;

                if (num6 === 0) {
                  if (TranslatorEngine.isLongestPhraseInSentence(chinese, i - 1, num5 - 1, TranslatorEngine.vietPhraseOneMeaningDictionary, translationAlgorithm)) {
                    j = num5;
                    const text2 = TranslatorEngine.ChineseToLuatNhan(chinese.substring(i, i + j), TranslatorEngine.nhanByOneMeaningDictionary!);
                    if (wrapType === 0) {
                      text = TranslatorEngine.appendTranslatedWordWithTrack(sb, text2, text);
                    } else {
                      text = TranslatorEngine.appendTranslatedWordWithTrack(sb, '[' + text2 + ']', text);
                    }
                    if (TranslatorEngine.nextCharIsChinese(chinese, i + j - 1)) {
                      sb.push(' ');
                      text += ' ';
                    }
                    flag = true;
                    i += j;
                    break;
                  }
                } else if (num6 <= 0) {
                  num2 = i + j - 1;
                  flag2 = false;
                  let num7 = 100;
                  while (i + num7 < chinese.length && TranslatorEngine.isChinese(chinese[i + num7 - 1])) {
                    num7++;
                  }
                  if (i + num7 <= chinese.length) {
                    const containsResult2 = TranslatorEngine.containsLuatNhan(chinese.substring(i, i + num7), TranslatorEngine.nhanByOneMeaningDictionary!);
                    let num6b: number;
                    if (typeof containsResult2 === 'object') {
                      num6b = containsResult2.index;
                    } else {
                      num6b = containsResult2;
                    }
                    if (num6b < 0) {
                      num2 = i + num7 - 1;
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (!flag) {
        if (TranslatorEngine.isChinese(chinese[i])) {
          const hv = ((wrapType !== 1) ? '' : '[') + TranslatorEngine._ChineseToHanVietChar(chinese[i]) + ((wrapType !== 1) ? '' : ']');
          text = TranslatorEngine.appendTranslatedWordWithTrack(sb, hv, text);
          if (TranslatorEngine.nextCharIsChinese(chinese, i)) {
            sb.push(' ');
            text += ' ';
          }
        } else if ((chinese[i] === '"' || chinese[i] === '\'') &&
                   !text.endsWith(' ') && !text.endsWith('.') && !text.endsWith('?') &&
                   !text.endsWith('!') && !text.endsWith('\t') &&
                   i < chinese.length - 1 && chinese[i + 1] !== ' ' && chinese[i + 1] !== ',') {
          sb.push(' ');
          sb.push(chinese[i]);
          text = text + ' ' + chinese[i];
        } else {
          sb.push(chinese[i]);
          text += chinese[i];
        }
        i++;
      }
    }
    return sb.join('');
  }

  // ===================================================================
  // ChineseToNameForBatch
  // ===================================================================

  public static ChineseToNameForBatch(chinese: string): string {
    const sb: string[] = [];
    const num = chinese.length - 1;
    let i = 0;
    while (i <= num) {
      let flag = false;
      if (TranslatorEngine.isChinese(chinese[i])) {
        for (let j = 20; j > 0; j--) {
          if (chinese.length >= i + j && TranslatorEngine.onlyNameDictionary.has(chinese.substring(i, i + j))) {
            sb.push(TranslatorEngine.onlyNameDictionary.get(chinese.substring(i, i + j))!);
            flag = true;
            i += j;
            break;
          }
        }
      }
      if (!flag) {
        sb.push(chinese[i]);
        i++;
      }
    }
    return sb.join('');
  }

  // ===================================================================
  // ChineseToMeanings
  // ===================================================================

  /**
   * Multi-dictionary meaning lookup for Chinese text segment.
   * Checks dictionaries in order: LuatNhan → VietPhrase → LacViet → Cedict → ThieuChuu → PhienAmEnglish.
   * @returns meanings text and the length of input that was matched
   */
  public static ChineseToMeanings(chinese: string): { result: string; phraseTranslatedLength: number } {
    let text = '';
    if (chinese.length === 0) {
      return { result: '', phraseTranslatedLength: 0 };
    }
    let num = 0;

    // Luat Nhan lookups
    for (let i = 20; i > 0; i--) {
      if (chinese.length >= i && !chinese.substring(0, i).includes('\n') && !chinese.substring(0, i).includes('\t')) {
        const containsIdx = TranslatorEngine.containsLuatNhan(chinese.substring(0, i), TranslatorEngine.vietPhraseDictionary);
        const idx = typeof containsIdx === 'object' ? containsIdx.index : containsIdx;
        if (idx !== 0) {
          break;
        }
        if (TranslatorEngine.matchesLuatNhan(chinese.substring(0, i), TranslatorEngine.vietPhraseDictionary)) {
          const empty = '';
          const luatNhanResult = TranslatorEngine.ChineseToLuatNhanWithPattern(chinese.substring(0, i), TranslatorEngine.vietPhraseDictionary);
          text += luatNhanResult.result + ' <<Luật Nhân>> ' +
            (TranslatorEngine.luatNhanDictionary.get(luatNhanResult.luatNhan) || '').replace(/\//g, '; ') +
            '\n-----------------\n';
          if (num === 0) {
            num = i;
          }
        }
      }
    }

    // VietPhrase lookups
    for (let j = 20; j > 0; j--) {
      if (chinese.length >= j) {
        const text3 = chinese.substring(0, j);
        if (TranslatorEngine.vietPhraseDictionary.has(text3)) {
          text += text3 + ' <<VietPhrase>> ' +
            (TranslatorEngine.vietPhraseDictionary.get(text3) || '').replace(/\//g, '; ') +
            '\n-----------------\n';
          if (num === 0) {
            num = text3.length;
          }
        }
      }
    }

    // Lac Viet lookups
    for (let k = 20; k > 0; k--) {
      if (chinese.length >= k) {
        const text3 = chinese.substring(0, k);
        if (TranslatorEngine.lacVietDictionary.has(text3)) {
          text += text3 + ' <<Lạc Việt>>\n' +
            TranslatorEngine.lacVietDictionary.get(text3) +
            '\n-----------------\n';
          if (num === 0) {
            num = 1;
          }
        }
      }
    }

    // Cedict lookups
    for (let l = 20; l > 0; l--) {
      if (chinese.length >= l) {
        const text3 = chinese.substring(0, l);
        if (TranslatorEngine.cedictDictionary.has(text3)) {
          text += text3 + ' <<Cedict or Babylon>> ' +
            (TranslatorEngine.cedictDictionary.get(text3) || '').replace('] /', '] ').replace(/\//g, '; ') +
            '\n-----------------\n';
          if (num === 0) {
            num = 1;
          }
        }
      }
    }

    // ThieuChuu
    if (TranslatorEngine.thieuChuuDictionary.has(chinese[0])) {
      num = (num === 0) ? 1 : num;
      text += chinese[0] + ' <<Thiều Chửu>> ' +
        TranslatorEngine.thieuChuuDictionary.get(chinese[0]) +
        '\n-----------------\n';
    }

    const num2 = (chinese.length < 10) ? chinese.length : 10;
    text += chinese.substring(0, num2).trim() + ' <<Phiên Âm English>> ';

    for (let m = 0; m < num2; m++) {
      if (TranslatorEngine.chinesePhienAmEnglishDictionary.has(chinese[m])) {
        text += '[' + TranslatorEngine.chinesePhienAmEnglishDictionary.get(chinese[m]) + '] ';
      } else {
        text += TranslatorEngine._ChineseToHanVietChar(chinese[m]) + ' ';
      }
    }

    if (num === 0) {
      num = 1;
      text = chinese[0] + '\n-----------------\nNot Found';
    }

    return { result: text, phraseTranslatedLength: num };
  }

  // ===================================================================
  // LoadDictionaries
  // ===================================================================

  // ═══════════════════════════════════════════════════════════════
  //  DICTIONARY LOADING (async, Promise-based)
  // ═══════════════════════════════════════════════════════════════

  public static async LoadDictionaries(): Promise<void> {
    if (!TranslatorEngine.dictionaryDirty) {
      return;
    }

    const lock = TranslatorEngine.lockObject;
    // Simple lock simulation
    if ((TranslatorEngine as any)._loading) {
      return;
    }
    (TranslatorEngine as any)._loading = true;

    try {
      // Run independent loads in parallel
      await Promise.all([
        TranslatorEngine.loadHanVietDictionaryAsync(),
        TranslatorEngine.loadThieuChuuDictionaryAsync(),
        TranslatorEngine.loadLacVietDictionaryAsync(),
        TranslatorEngine.loadCedictDictionaryAsync(),
        TranslatorEngine.loadChinesePhienAmEnglishDictionaryAsync(),
        TranslatorEngine.loadIgnoredChinesePhraseListsAsync(),
        TranslatorEngine.loadOnlyNameDictionaryHistoryAsync(),
        TranslatorEngine.loadOnlyNamePhuDictionaryHistoryAsync(),
        TranslatorEngine.loadOnlyVietPhraseDictionaryHistoryAsync(),
        TranslatorEngine.loadHanVietDictionaryHistoryAsync(),
      ]);

      // Run dependent loads with sync waits
      const [luatNhanPromise, pronounPromise, onlyVietPhrasePromise, onlyNamePromise] = await Promise.all([
        TranslatorEngine.loadLuatNhanDictionaryAsync(),
        TranslatorEngine.loadPronounDictionaryAsync(),
        TranslatorEngine.loadOnlyVietPhraseDictionaryAsync(),
        TranslatorEngine.loadOnlyNameDictionaryAsync(),
      ]);

      // After pronoun, onlyVietPhrase, onlyName are done:
      TranslatorEngine.loadVietPhraseDictionary();
      TranslatorEngine.vietPhraseDictionaryToVietPhraseOneMeaningDictionary();
      TranslatorEngine.pronounDictionaryToPronounOneMeaningDictionary();
      TranslatorEngine.loadNhanByDictionary();
      TranslatorEngine.loadNhanByOneMeaningDictionary();

      // Wait for luatNhan (was the last one)
      await luatNhanPromise;

      TranslatorEngine.dictionaryDirty = false;
    } finally {
      (TranslatorEngine as any)._loading = false;
    }
  }

  // ===================================================================
  // Dictionary loading methods
  // ===================================================================

  private static async loadLuatNhanDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadLuatNhanDictionary();
  }

  private static loadLuatNhanDictionary(): void {
    const dictionary = new Map<string, string>();
    const filePath = DictionaryConfigurationHelper.GetLuatNhanDictionaryPath();
    if (!TranslatorEngine.fs.existsSync(filePath)) {
      return;
    }
    const content = TranslatorEngine.fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith('#')) {
        const parts = line.split('=');
        if (parts.length === 2 && !dictionary.has(parts[0])) {
          dictionary.set(parts[0], parts[1]);
        }
      }
    }
    const sorted = [...dictionary.entries()].sort((a, b) => {
      if (b[0].length !== a[0].length) return b[0].length - a[0].length;
      return a[0].localeCompare(b[0]);
    });
    TranslatorEngine.luatNhanDictionary.clear();
    for (const [k, v] of sorted) {
      TranslatorEngine.luatNhanDictionary.set(k, v);
    }
  }

  private static compareLuatNhan(x: [string, string], y: [string, string]): number {
    if (x[0].startsWith('{0}') || x[0].endsWith('{0}')) {
      if (!y[0].startsWith('{0}') && !y[0].endsWith('{0}')) {
        return 1;
      }
    } else if (y[0].startsWith('{0}') || y[0].endsWith('{0}')) {
      return -1;
    }
    return y[0].length - x[0].length;
  }

  private static async loadHanVietDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadHanVietDictionary();
  }

  private static loadHanVietDictionary(): void {
    TranslatorEngine.hanVietDictionary.clear();
    const filePath = DictionaryConfigurationHelper.GetChinesePhienAmWordsDictionaryPath();
    if (!TranslatorEngine.fs.existsSync(filePath)) {
      return;
    }
    const content = TranslatorEngine.fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length === 2 && !TranslatorEngine.hanVietDictionary.has(parts[0])) {
        TranslatorEngine.hanVietDictionary.set(parts[0], parts[1]);
      }
    }
  }

  private static loadVietPhraseDictionary(): void {
    TranslatorEngine.vietPhraseDictionary.clear();
    for (const [key, value] of TranslatorEngine.onlyNameDictionary) {
      if (!TranslatorEngine.vietPhraseDictionary.has(key)) {
        TranslatorEngine.vietPhraseDictionary.set(key, value);
      }
    }
    for (const [key, value] of TranslatorEngine.onlyVietPhraseDictionary) {
      if (!TranslatorEngine.vietPhraseDictionary.has(key)) {
        TranslatorEngine.vietPhraseDictionary.set(key, value);
      }
    }
  }

  private static async loadOnlyVietPhraseDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadOnlyVietPhraseDictionary();
  }

  private static loadOnlyVietPhraseDictionary(): void {
    TranslatorEngine.onlyVietPhraseDictionary.clear();
    const filePath = DictionaryConfigurationHelper.GetVietPhraseDictionaryPath();
    if (!TranslatorEngine.fs.existsSync(filePath)) {
      return;
    }
    const content = TranslatorEngine.fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length === 2 && !TranslatorEngine.onlyVietPhraseDictionary.has(parts[0])) {
        TranslatorEngine.onlyVietPhraseDictionary.set(parts[0], parts[1]);
      }
    }
  }

  private static async loadOnlyNameDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadOnlyNameDictionary();
  }

  private static loadOnlyNameDictionary(): void {
    TranslatorEngine.onlyNameDictionary.clear();
    TranslatorEngine.onlyNameOneMeaningDictionary.clear();
    TranslatorEngine.onlyNameChinhDictionary.clear();
    TranslatorEngine.onlyNamePhuDictionary.clear();
    const separator = /[/|]/;

    const namesPath = DictionaryConfigurationHelper.GetNamesDictionaryPath();
    if (TranslatorEngine.fs.existsSync(namesPath)) {
      const content = TranslatorEngine.fs.readFileSync(namesPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.split('=');
        if (parts.length === 2 && !TranslatorEngine.onlyNameDictionary.has(parts[0])) {
          TranslatorEngine.onlyNameDictionary.set(parts[0], parts[1]);
          TranslatorEngine.onlyNameOneMeaningDictionary.set(parts[0], parts[1].split(separator)[0]);
          TranslatorEngine.onlyNameChinhDictionary.set(parts[0], parts[1]);
        }
      }
    }

    const namesPhuPath = DictionaryConfigurationHelper.GetNamesPhuDictionaryPath();
    if (TranslatorEngine.fs.existsSync(namesPhuPath)) {
      const content = TranslatorEngine.fs.readFileSync(namesPhuPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.split('=');
        if (parts.length === 2 && !TranslatorEngine.onlyNamePhuDictionary.has(parts[0])) {
          if (TranslatorEngine.onlyNameDictionary.has(parts[0])) {
            TranslatorEngine.onlyNameDictionary.set(parts[0], parts[1]);
            TranslatorEngine.onlyNameOneMeaningDictionary.set(parts[0], parts[1].split(separator)[0]);
          } else {
            TranslatorEngine.onlyNameDictionary.set(parts[0], parts[1]);
            TranslatorEngine.onlyNameOneMeaningDictionary.set(parts[0], parts[1].split(separator)[0]);
          }
          TranslatorEngine.onlyNamePhuDictionary.set(parts[0], parts[1]);
        }
      }
    }
  }

  private static vietPhraseDictionaryToVietPhraseOneMeaningDictionary(): void {
    TranslatorEngine.vietPhraseOneMeaningDictionary.clear();
    for (const [key, value] of TranslatorEngine.vietPhraseDictionary) {
      TranslatorEngine.vietPhraseOneMeaningDictionary.set(
        key,
        (value.includes('/') || value.includes('|')) ? value.split(/[\/|]/)[0] : value
      );
    }
  }

  private static pronounDictionaryToPronounOneMeaningDictionary(): void {
    TranslatorEngine.pronounOneMeaningDictionary.clear();
    for (const [key, value] of TranslatorEngine.pronounDictionary) {
      TranslatorEngine.pronounOneMeaningDictionary.set(
        key,
        (value.includes('/') || value.includes('|')) ? value.split(/[\/|]/)[0] : value
      );
    }
  }

  private static loadNhanByDictionary(): void {
    if (DictionaryConfigurationHelper.IsNhanByPronouns) {
      TranslatorEngine.nhanByDictionary = TranslatorEngine.pronounDictionary;
      return;
    }
    if (DictionaryConfigurationHelper.IsNhanByPronounsAndNames) {
      TranslatorEngine.nhanByDictionary = new Map(TranslatorEngine.pronounDictionary);
      for (const [key, value] of TranslatorEngine.onlyNameDictionary) {
        if (!TranslatorEngine.nhanByDictionary.has(key)) {
          TranslatorEngine.nhanByDictionary.set(key, value);
        }
      }
      return;
    }
    if (DictionaryConfigurationHelper.IsNhanByPronounsAndNamesAndVietPhrase) {
      TranslatorEngine.nhanByDictionary = new Map(TranslatorEngine.pronounDictionary);
      for (const [key, value] of TranslatorEngine.vietPhraseDictionary) {
        if (!TranslatorEngine.nhanByDictionary.has(key)) {
          TranslatorEngine.nhanByDictionary.set(key, value);
        }
      }
      return;
    }
    TranslatorEngine.nhanByDictionary = null;
  }

  private static loadNhanByOneMeaningDictionary(): void {
    if (DictionaryConfigurationHelper.IsNhanByPronouns) {
      TranslatorEngine.nhanByOneMeaningDictionary = TranslatorEngine.pronounOneMeaningDictionary;
      return;
    }
    if (DictionaryConfigurationHelper.IsNhanByPronounsAndNames) {
      TranslatorEngine.nhanByOneMeaningDictionary = new Map(TranslatorEngine.pronounOneMeaningDictionary);
      for (const [key, value] of TranslatorEngine.onlyNameOneMeaningDictionary) {
        if (!TranslatorEngine.nhanByOneMeaningDictionary.has(key)) {
          TranslatorEngine.nhanByOneMeaningDictionary.set(key, value);
        }
      }
      return;
    }
    if (DictionaryConfigurationHelper.IsNhanByPronounsAndNamesAndVietPhrase) {
      TranslatorEngine.nhanByOneMeaningDictionary = new Map(TranslatorEngine.pronounOneMeaningDictionary);
      for (const [key, value] of TranslatorEngine.vietPhraseOneMeaningDictionary) {
        if (!TranslatorEngine.nhanByOneMeaningDictionary.has(key)) {
          TranslatorEngine.nhanByOneMeaningDictionary.set(key, value);
        }
      }
      return;
    }
    TranslatorEngine.nhanByOneMeaningDictionary = null;
  }

  private static async loadThieuChuuDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadThieuChuuDictionary();
  }

  private static loadThieuChuuDictionary(): void {
    TranslatorEngine.thieuChuuDictionary.clear();
    const filePath = DictionaryConfigurationHelper.GetThieuChuuDictionaryPath();
    if (!TranslatorEngine.fs.existsSync(filePath)) {
      return;
    }
    const content = TranslatorEngine.fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length === 2 && !TranslatorEngine.thieuChuuDictionary.has(parts[0])) {
        TranslatorEngine.thieuChuuDictionary.set(parts[0], parts[1]);
      }
    }
  }

  private static async loadLacVietDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadLacVietDictionary();
  }

  private static loadLacVietDictionary(): void {
    TranslatorEngine.lacVietDictionary.clear();
    const filePath = DictionaryConfigurationHelper.GetLacVietDictionaryPath();
    if (!TranslatorEngine.fs.existsSync(filePath)) {
      return;
    }
    const content = TranslatorEngine.fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length === 2 && !TranslatorEngine.lacVietDictionary.has(parts[0])) {
        TranslatorEngine.lacVietDictionary.set(parts[0], parts[1]);
      }
    }
  }

  private static async loadCedictDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadCedictDictionary();
  }

  private static loadCedictDictionary(): void {
    TranslatorEngine.cedictDictionary.clear();

    const cedictPath = DictionaryConfigurationHelper.GetCEDictDictionaryPath();
    if (TranslatorEngine.fs.existsSync(cedictPath)) {
      const content = TranslatorEngine.fs.readFileSync(cedictPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith('#')) {
          const bracketIdx = line.indexOf(' [');
          if (bracketIdx >= 0) {
            const text2 = line.substring(0, bracketIdx);
            const parts = text2.split(' ');
            for (const key of parts) {
              if (!TranslatorEngine.cedictDictionary.has(key)) {
                TranslatorEngine.cedictDictionary.set(key, line.substring(bracketIdx));
              }
            }
          }
        }
      }
    }

    const babylonPath = DictionaryConfigurationHelper.GetBabylonDictionaryPath();
    if (TranslatorEngine.fs.existsSync(babylonPath)) {
      const content = TranslatorEngine.fs.readFileSync(babylonPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const parts = line.split('=');
        if (!TranslatorEngine.cedictDictionary.has(parts[0])) {
          TranslatorEngine.cedictDictionary.set(parts[0], parts[1]);
        }
      }
    }
  }

  private static async loadChinesePhienAmEnglishDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadChinesePhienAmEnglishDictionary();
  }

  private static loadChinesePhienAmEnglishDictionary(): void {
    TranslatorEngine.chinesePhienAmEnglishDictionary.clear();
    const filePath = DictionaryConfigurationHelper.GetChinesePhienAmEnglishWordsDictionaryPath();
    if (!TranslatorEngine.fs.existsSync(filePath)) {
      return;
    }
    const content = TranslatorEngine.fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length === 2 && !TranslatorEngine.chinesePhienAmEnglishDictionary.has(parts[0])) {
        TranslatorEngine.chinesePhienAmEnglishDictionary.set(parts[0], parts[1]);
      }
    }
  }

  private static async loadPronounDictionaryAsync(): Promise<void> {
    TranslatorEngine.loadPronounDictionary();
  }

  private static loadPronounDictionary(): void {
    TranslatorEngine.pronounDictionary.clear();
    const filePath = DictionaryConfigurationHelper.GetPronounsDictionaryPath();
    if (!TranslatorEngine.fs.existsSync(filePath)) {
      return;
    }
    const content = TranslatorEngine.fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length === 2 && !TranslatorEngine.pronounDictionary.has(parts[0])) {
        TranslatorEngine.pronounDictionary.set(parts[0], parts[1]);
      }
    }
  }

  // ===================================================================
  // History log methods
  // ===================================================================

  private static async loadIgnoredChinesePhraseListsAsync(): Promise<void> {
    TranslatorEngine.loadIgnoredChinesePhraseLists();
  }

  private static async loadOnlyVietPhraseDictionaryHistoryAsync(): Promise<void> {
    TranslatorEngine.loadOnlyVietPhraseDictionaryHistory();
  }

  private static async loadOnlyNameDictionaryHistoryAsync(): Promise<void> {
    TranslatorEngine.loadOnlyNameDictionaryHistory();
  }

  private static async loadOnlyNamePhuDictionaryHistoryAsync(): Promise<void> {
    TranslatorEngine.loadOnlyNamePhuDictionaryHistory();
  }

  private static async loadHanVietDictionaryHistoryAsync(): Promise<void> {
    TranslatorEngine.loadHanVietDictionaryHistory();
  }

  private static loadOnlyVietPhraseDictionaryHistory(): void {
    TranslatorEngine.LoadDictionaryHistory(
      DictionaryConfigurationHelper.GetVietPhraseDictionaryHistoryPath(),
      TranslatorEngine.onlyVietPhraseDictionaryHistoryDataSet
    );
  }

  private static loadOnlyNameDictionaryHistory(): void {
    TranslatorEngine.LoadDictionaryHistory(
      DictionaryConfigurationHelper.GetNamesDictionaryHistoryPath(),
      TranslatorEngine.onlyNameDictionaryHistoryDataSet
    );
  }

  private static loadOnlyNamePhuDictionaryHistory(): void {
    TranslatorEngine.LoadDictionaryHistory(
      DictionaryConfigurationHelper.GetNamesPhuDictionaryHistoryPath(),
      TranslatorEngine.onlyNamePhuDictionaryHistoryDataSet
    );
  }

  private static loadHanVietDictionaryHistory(): void {
    TranslatorEngine.LoadDictionaryHistory(
      DictionaryConfigurationHelper.GetChinesePhienAmWordsDictionaryHistoryPath(),
      TranslatorEngine.hanVietDictionaryHistoryDataSet
    );
  }

  public static LoadDictionaryHistory(dictionaryHistoryPath: string, dictionaryHistoryDataSet: Map<string, { action: string; userName: string; updatedDate: Date }>): void {
    dictionaryHistoryDataSet.clear();

    if (!TranslatorEngine.fs.existsSync(dictionaryHistoryPath)) {
      return;
    }

    const content = TranslatorEngine.fs.readFileSync(dictionaryHistoryPath, 'utf8');
    const lines = content.split(/\r?\n/);
    // Skip header line
    for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length === 4) {
        const key = parts[0];
        const action = parts[1];
        const userName = parts[2];
        const updatedDate = new Date(parts[3]);
        if (!dictionaryHistoryDataSet.has(key)) {
          dictionaryHistoryDataSet.set(key, { action, userName, updatedDate });
        } else {
          const existing = dictionaryHistoryDataSet.get(key)!;
          existing.action = action;
          existing.userName = userName;
          existing.updatedDate = updatedDate;
        }
      }
    }
  }

  // ===================================================================
  // Ignored Chinese phrase list
  // ===================================================================

  public static AddIgnoredChinesePhrase(ignoredChinesePhrase: string): void {
    if (TranslatorEngine.ignoredChinesePhraseList.includes(ignoredChinesePhrase)) {
      return;
    }
    TranslatorEngine.ignoredChinesePhraseList.push(ignoredChinesePhrase);
    try {
      const filePath = DictionaryConfigurationHelper.GetIgnoredChinesePhraseListPath();
      TranslatorEngine.fs.writeFileSync(filePath, TranslatorEngine.ignoredChinesePhraseList.join('\n'), 'utf8');
    } catch {
      // silently ignore
    }
    TranslatorEngine.loadIgnoredChinesePhraseLists();
  }

  private static loadIgnoredChinesePhraseLists(): void {
    TranslatorEngine.ignoredChinesePhraseList = [];
    TranslatorEngine.ignoredChinesePhraseForBrowserList = [];
    const trimChars = '\t\n';

    const filePath = DictionaryConfigurationHelper.GetIgnoredChinesePhraseListPath();
    if (!TranslatorEngine.fs.existsSync(filePath)) {
      return;
    }
    const content = TranslatorEngine.fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (line) {
        const text2 = TranslatorEngine.standardizeInputWithoutRemovingIgnoredChinesePhrases(line).trim();
        if (text2 && !TranslatorEngine.ignoredChinesePhraseList.includes(text2)) {
          TranslatorEngine.ignoredChinesePhraseList.push(text2);
        }
        const text3 = TranslatorEngine.standardizeInputForBrowserWithoutRemovingIgnoredChinesePhrases(line).trim();
        if (text3 && !TranslatorEngine.ignoredChinesePhraseForBrowserList.includes(text3)) {
          TranslatorEngine.ignoredChinesePhraseForBrowserList.push(text3);
        }
      }
    }

    TranslatorEngine.ignoredChinesePhraseList.sort(TranslatorEngine.compareStringByDescending);
    TranslatorEngine.ignoredChinesePhraseForBrowserList.sort(TranslatorEngine.compareStringByDescending);
  }

  private static compareStringByDescending(x: string, y: string): number {
    if (x === null) {
      if (y === null) return 0;
      return 1;
    }
    if (y === null) return -1;
    const num = x.length - y.length;
    if (num !== 0) return -num;
    return -x.localeCompare(y);
  }

  // ===================================================================
  // Standardize input methods
  // ===================================================================

  /**
   * Normalize Chinese text: full-width→half-width punctuation, CJK punctuation→ASCII,
   * insert spaces between Chinese/non-Chinese, remove ignored phrases, indent lines.
   */
  public static StandardizeInput(original: string): string {
    const standardizedChinese = TranslatorEngine.standardizeInputWithoutRemovingIgnoredChinesePhrases(original);
    return TranslatorEngine.removeIgnoredChinesePhrases(standardizedChinese);
  }

  private static standardizeInputWithoutRemovingIgnoredChinesePhrases(original: string): string {
    if (!original) {
      return '';
    }
    let text = TranslatorEngine.ToSimplified(original);

    const fullWidthChars = ['，', '。', '：', '“', '”', '‘', '’', '？', '！', '「', '」', '．', '、', '\u3000', '…', TranslatorEngine.NULL_STRING];
    const narrowChars = [', ', '.', ': ', '"', '" ', "'", "' ", '?', '!', '"', '" ', '.', ', ', ' ', '...', ''];

    for (let i = 0; i < fullWidthChars.length; i++) {
      text = text.replace(new RegExp(this.escapeRegex(fullWidthChars[i]), 'g'), narrowChars[i]);
    }

    text = text.replace(/  /g, ' ').replace(/ \r\n/g, '\n').replace(/ \n/g, '\n').replace(/ ,/g, ',');
    text = TranslatorEngine.ToNarrow(text);

    const length = text.length;
    const sb: string[] = [];

    for (let j = 0; j < length - 1; j++) {
      const c = text[j];
      const c2 = text[j + 1];

      if (!this.isControlChar(c) || c === '\t' || c === '\n' || c === '\r') {
        if (TranslatorEngine.isChinese(c)) {
          if (!TranslatorEngine.isChinese(c2) && c2 !== ',' && c2 !== '.' && c2 !== ':' && c2 !== ';' && c2 !== '"' && c2 !== '\'' && c2 !== '?' && c2 !== ' ' && c2 !== '!' && c2 !== ')') {
            sb.push(c, ' ');
          } else {
            sb.push(c);
          }
        } else if (c === '\t' || c === ' ' || c === '"' || c === '\'' || c === '\n' || c === '(') {
          sb.push(c);
        } else if (c === '!' || c === '.' || c === '?') {
          if (c2 === '"' || c2 === ' ' || c2 === '\'') {
            sb.push(c);
          } else {
            sb.push(c, ' ');
          }
        } else if (TranslatorEngine.isChinese(c2)) {
          sb.push(c, ' ');
        } else {
          sb.push(c);
        }
      }
    }
    sb.push(text[length - 1]);

    let result = sb.join('');
    result = TranslatorEngine.indentAllLines(result, true);
    return result.replace(/\. \. \. \. \. \./g, '...');
  }

  private static isControlChar(c: string): boolean {
    const code = c.charCodeAt(0);
    return code < 0x20 && c !== '\t' && c !== '\n' && c !== '\r';
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  public static StandardizeInputForBrowser(input: string): string {
    const standardizedChinese = TranslatorEngine.standardizeInputForBrowserWithoutRemovingIgnoredChinesePhrases(input);
    return TranslatorEngine.removeIgnoredChinesePhrasesForBrowser(standardizedChinese);
  }

  private static standardizeInputForBrowserWithoutRemovingIgnoredChinesePhrases(original: string): string {
    if (!original) {
      return '';
    }
    let text = TranslatorEngine.ToSimplified(original);

    const fullWidthChars = ['，', '。', '：', '“', '”', '‘', '’', '？', '！', '「', '」', '．', '、', '\u3000', '…', TranslatorEngine.NULL_STRING];
    const narrowChars = [', ', '.', ': ', '"', '" ', "'", "' ", '?', '!', '"', '" ', '.', ', ', ' ', '...', ''];

    for (let i = 0; i < fullWidthChars.length; i++) {
      text = text.replace(new RegExp(this.escapeRegex(fullWidthChars[i]), 'g'), narrowChars[i]);
    }

    text = text.replace(/  /g, ' ').replace(/ \r\n/g, '\n').replace(/ \n/g, '\n');
    text = TranslatorEngine.ToNarrow(text);

    const length = text.length;
    const sb: string[] = [];

    for (let j = 0; j < length - 1; j++) {
      const c = text[j];
      const c2 = text[j + 1];

      if (TranslatorEngine.isChinese(c)) {
        if (!TranslatorEngine.isChinese(c2) && c2 !== ',' && c2 !== '.' && c2 !== ':' && c2 !== ';' && c2 !== '"' && c2 !== '\'' && c2 !== '?' && c2 !== ' ' && c2 !== '!') {
          sb.push(c, ' ');
        } else {
          sb.push(c);
        }
      } else if (c === '\t' || c === ' ' || c === '"' || c === '\'' || c === '\n') {
        sb.push(c);
      } else if (TranslatorEngine.isChinese(c2)) {
        sb.push(c, ' ');
      } else {
        sb.push(c);
      }
    }
    sb.push(text[length - 1]);
    return TranslatorEngine.indentAllLines(sb.join(''));
  }

  public static StandardizeInputForProxy(original: string): string {
    const standardizedChinese = TranslatorEngine.standardizeInputForProxyWithoutRemovingIgnoredChinesePhrases(original);
    return TranslatorEngine.removeIgnoredChinesePhrasesForBrowser(standardizedChinese);
  }

  private static standardizeInputForProxyWithoutRemovingIgnoredChinesePhrases(original: string): string {
    if (!original) {
      return '';
    }
    let text = TranslatorEngine.ToSimplified(original);

    const fullWidthChars = ['，', '。', '：', '“', '”', '‘', '’', '？', '！', '「', '」', '．', '、', '\u3000', '…', TranslatorEngine.NULL_STRING];
    const narrowChars = [', ', '.', ': ', '"', '" ', "'", "' ", '?', '!', '"', '" ', '.', ', ', ' ', '...', ''];

    for (let i = 0; i < fullWidthChars.length; i++) {
      text = text.replace(new RegExp(this.escapeRegex(fullWidthChars[i]), 'g'), narrowChars[i]);
    }

    text = text.replace(/  /g, ' ').replace(/ \r\n/g, '\n').replace(/ \n/g, '\n');
    text = TranslatorEngine.ToNarrow(text);

    const length = text.length;
    const sb: string[] = [];

    for (let j = 0; j < length - 1; j++) {
      const c = text[j];
      const c2 = text[j + 1];

      if (TranslatorEngine.isChinese(c)) {
        if (!TranslatorEngine.isChinese(c2) && c2 !== ',' && c2 !== '.' && c2 !== ':' && c2 !== ';' && c2 !== '"' && c2 !== '\'' && c2 !== '?' && c2 !== ' ' && c2 !== '!') {
          sb.push(c, ' ');
        } else {
          sb.push(c);
        }
      } else if (c === '\t' || c === ' ' || c === '"' || c === '\'' || c === '\n') {
        sb.push(c);
      } else if (TranslatorEngine.isChinese(c2)) {
        sb.push(c, ' ');
      } else {
        sb.push(c);
      }
    }
    sb.push(text[length - 1]);
    return text; // C# returns text here (not the rebuilt string)
  }

  private static indentAllLines(text: string, insertBlankLine?: boolean): string {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const sb: string[] = [];
    for (const line of lines) {
      sb.push('\t' + line.trim() + '\n' + (insertBlankLine ? '\n' : ''));
    }
    return sb.join('');
  }

  // ===================================================================
  // classifyWordsIntoLatinAndChinese
  // ===================================================================

  private static classifyWordsIntoLatinAndChinese(inputText: string): string[] {
    const list: string[] = [];
    const sb: string[] = [];
    let flag = false;

    for (let i = 0; i < inputText.length; i++) {
      const c = inputText[i];
      if (TranslatorEngine.isChinese(c)) {
        if (flag) {
          sb.push(c);
        } else {
          list.push(sb.join(''));
          sb.length = 0;
          sb.push(c);
        }
        flag = true;
      } else {
        if (!flag) {
          sb.push(c);
        } else {
          list.push(sb.join(''));
          sb.length = 0;
          sb.push(c);
        }
        flag = false;
      }
    }
    list.push(sb.join(''));
    return list;
  }

  private static classifyWordsIntoLatinAndChineseForProxy(inputText: string): string[] {
    const list: string[] = [];
    const sb: string[] = [];
    let flag = false;
    let flag2 = false;

    for (let i = 0; i < inputText.length; i++) {
      const c = inputText[i];
      if (flag2) {
        sb.push(c);
        flag = false;
        if (c === '>') {
          list.push(sb.join(''));
          sb.length = 0;
          flag2 = false;
        }
      } else if (c === '<') {
        list.push(sb.join(''));
        sb.length = 0;
        sb.push(c);
        flag2 = true;
        flag = false;
      } else if (TranslatorEngine.isChinese(c)) {
        if (flag) {
          sb.push(c);
        } else {
          list.push(sb.join(''));
          sb.length = 0;
          sb.push(c);
        }
        flag = true;
      } else {
        if (!flag) {
          sb.push(c);
        } else {
          list.push(sb.join(''));
          sb.length = 0;
          sb.push(c);
        }
        flag = false;
      }
    }
    list.push(sb.join(''));
    return list;
  }

  // ===================================================================
  // Analyzer methods
  // ===================================================================

  public static IsInVietPhrase(chinese: string): boolean {
    return TranslatorEngine.vietPhraseDictionary.has(chinese);
  }

  public static ChineseToHanVietForAnalyzer(chinese: string): string {
    const sb: string[] = [];
    for (let i = 0; i < chinese.length; i++) {
      const c = chinese[i];
      if (TranslatorEngine.hanVietDictionary.has(c)) {
        sb.push(TranslatorEngine.hanVietDictionary.get(c) + ' ');
      } else {
        sb.push(c + ' ');
      }
    }
    return sb.join('').trim();
  }

  public static ChineseToVietPhraseForAnalyzer(chinese: string, translationAlgorithm: number, prioritizedName: boolean): string {
    return TranslatorEngine.ChineseToVietPhraseForBrowser(chinese, 11, translationAlgorithm, prioritizedName)
      .trim();
  }

  // ===================================================================
  // containsName
  // ===================================================================

  private static containsName(chinese: string, startIndex: number, phraseLength: number): boolean {
    if (phraseLength < 2) {
      return false;
    }
    if (TranslatorEngine.onlyNameDictionary.has(chinese.substring(startIndex, startIndex + phraseLength))) {
      return false;
    }
    const num = startIndex + phraseLength - 1;
    const num2 = 2;
    for (let i = startIndex + 1; i <= num; i++) {
      for (let j = 20; j >= num2; j--) {
        if (chinese.length >= i + j && TranslatorEngine.onlyNameDictionary.has(chinese.substring(i, i + j))) {
          return true;
        }
      }
    }
    return false;
  }

  // ===================================================================
  // isLongestPhraseInSentence
  // ===================================================================

  private static isLongestPhraseInSentence(
    chinese: string,
    startIndex: number,
    phraseLength: number,
    dictionary: Map<string, string>,
    translationAlgorithm: number
  ): boolean {
    if (phraseLength < 2) {
      return true;
    }
    const num = (translationAlgorithm === 0) ? phraseLength : ((phraseLength < 3) ? 3 : phraseLength);
    const num2 = startIndex + phraseLength - 1;
    for (let i = startIndex + 1; i <= num2; i++) {
      for (let j = 20; j > num; j--) {
        if (chinese.length >= i + j && dictionary.has(chinese.substring(i, i + j))) {
          return false;
        }
      }
    }
    return true;
  }

  // ===================================================================
  // Dictionary count / existence queries
  // ===================================================================

  public static GetVietPhraseDictionaryCount(): number {
    return TranslatorEngine.onlyVietPhraseDictionary.size;
  }

  public static GetNameDictionaryCount(isNameChinh: boolean): number {
    if (!isNameChinh) {
      return TranslatorEngine.onlyNamePhuDictionary.size;
    }
    return TranslatorEngine.onlyNameChinhDictionary.size;
  }

  public static GetPhienAmDictionaryCount(): number {
    return TranslatorEngine.hanVietDictionary.size;
  }

  public static ExistInPhienAmDictionary(chinese: string): boolean {
    return chinese.length === 1 && TranslatorEngine.hanVietDictionary.has(chinese);
  }

  // ===================================================================
  // History log methods
  // ===================================================================

  private static updateHistoryLogInCache(
    key: string,
    action: string,
    dictionaryHistoryDataSet: Map<string, { action: string; userName: string; updatedDate: Date }>
  ): void {
    const now = new Date();
    if (dictionaryHistoryDataSet.has(key)) {
      const existing = dictionaryHistoryDataSet.get(key)!;
      existing.action = action;
      existing.userName = ''; /* process.env.USERNAME placeholder */
      existing.updatedDate = now;
    } else {
      dictionaryHistoryDataSet.set(key, {
        action,
        userName: '', /* process.env.USERNAME placeholder */
        updatedDate: now
      });
    }
  }

  private static writeVietPhraseHistoryLog(key: string, action: string): void {
    TranslatorEngine.updateHistoryLogInCache(key, action, TranslatorEngine.onlyVietPhraseDictionaryHistoryDataSet);
    TranslatorEngine.WriteHistoryLogToFile(key, action, DictionaryConfigurationHelper.GetVietPhraseDictionaryHistoryPath());
  }

  private static writeNamesHistoryLog(key: string, action: string, isNameChinh: boolean): void {
    const dataSet = isNameChinh ? TranslatorEngine.onlyNameDictionaryHistoryDataSet : TranslatorEngine.onlyNamePhuDictionaryHistoryDataSet;
    TranslatorEngine.updateHistoryLogInCache(key, action, dataSet);
    TranslatorEngine.WriteHistoryLogToFile(key, action, isNameChinh ? DictionaryConfigurationHelper.GetNamesDictionaryHistoryPath() : DictionaryConfigurationHelper.GetNamesPhuDictionaryHistoryPath());
  }

  private static writePhienAmHistoryLog(key: string, action: string): void {
    TranslatorEngine.updateHistoryLogInCache(key, action, TranslatorEngine.hanVietDictionaryHistoryDataSet);
    TranslatorEngine.WriteHistoryLogToFile(key, action, DictionaryConfigurationHelper.GetChinesePhienAmWordsDictionaryHistoryPath());
  }

  public static GetVietPhraseHistoryLogRecord(key: string): string {
    return TranslatorEngine.getDictionaryHistoryLogRecordInCache(key, TranslatorEngine.onlyVietPhraseDictionaryHistoryDataSet);
  }

  public static GetNameHistoryLogRecord(key: string, isNameChinh: boolean): string {
    return TranslatorEngine.getDictionaryHistoryLogRecordInCache(key, isNameChinh ? TranslatorEngine.onlyNameDictionaryHistoryDataSet : TranslatorEngine.onlyNamePhuDictionaryHistoryDataSet);
  }

  public static GetPhienAmHistoryLogRecord(key: string): string {
    return TranslatorEngine.getDictionaryHistoryLogRecordInCache(key, TranslatorEngine.hanVietDictionaryHistoryDataSet);
  }

  private static getDictionaryHistoryLogRecordInCache(
    key: string,
    dictionaryHistoryDataSet: Map<string, { action: string; userName: string; updatedDate: Date }>
  ): string {
    if (!dictionaryHistoryDataSet.has(key)) {
      return '';
    }
    const record = dictionaryHistoryDataSet.get(key)!;
    const dateStr = record.updatedDate.toISOString().replace('T', ' ').substring(0, 23) + '+07:00';
    return `Entry này đã được <${record.action}> bởi <${record.userName}> vào <${dateStr}>.`;
  }

  public static CompressPhienAmDictionaryHistory(): void {
    TranslatorEngine.CompressDictionaryHistory(TranslatorEngine.hanVietDictionaryHistoryDataSet, DictionaryConfigurationHelper.GetChinesePhienAmWordsDictionaryHistoryPath());
  }

  public static CompressOnlyVietPhraseDictionaryHistory(): void {
    TranslatorEngine.CompressDictionaryHistory(TranslatorEngine.onlyVietPhraseDictionaryHistoryDataSet, DictionaryConfigurationHelper.GetVietPhraseDictionaryHistoryPath());
  }

  public static CompressOnlyNameDictionaryHistory(isNameChinh: boolean): void {
    TranslatorEngine.CompressDictionaryHistory(
      isNameChinh ? TranslatorEngine.onlyNameDictionaryHistoryDataSet : TranslatorEngine.onlyNamePhuDictionaryHistoryDataSet,
      isNameChinh ? DictionaryConfigurationHelper.GetNamesDictionaryHistoryPath() : DictionaryConfigurationHelper.GetNamesPhuDictionaryHistoryPath()
    );
  }

  private static CompressDictionaryHistory(
    dictionaryHistoryDataSet: Map<string, { action: string; userName: string; updatedDate: Date }>,
    dictionaryHistoryFilePath: string
  ): void {
    const backupPath = dictionaryHistoryFilePath + '.' + Date.now();
    if (TranslatorEngine.fs.existsSync(dictionaryHistoryFilePath)) {
      TranslatorEngine.fs.copyFileSync(dictionaryHistoryFilePath, backupPath);
    }

    try {
      let content = 'Entry\tAction\tUser Name\tUpdated Date\n';
      for (const [key, record] of dictionaryHistoryDataSet) {
        const dateStr = record.updatedDate.toISOString().replace('T', ' ').substring(0, 23) + '+07:00';
        content += `${key}\t${record.action}\t${record.userName}\t${dateStr}\n`;
      }
      TranslatorEngine.fs.writeFileSync(dictionaryHistoryFilePath, content, 'utf8');
    } catch (ex) {
      if (TranslatorEngine.fs.existsSync(backupPath)) {
        try {
          TranslatorEngine.fs.copyFileSync(backupPath, dictionaryHistoryFilePath);
        } catch {
          // silently ignore
        }
      }
      throw ex;
    } finally {
      try {
        TranslatorEngine.fs.unlinkSync(backupPath);
      } catch {
        // silently ignore
      }
    }
  }

  public static WriteHistoryLogToFile(key: string, action: string, logPath: string): void {
    const userName = ''; /* process.env.USERNAME placeholder */
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 23) + '+07:00';

    if (!TranslatorEngine.fs.existsSync(logPath)) {
      TranslatorEngine.fs.writeFileSync(logPath, 'Entry\tAction\tUser Name\tUpdated Date\r\n', 'utf8');
    }

    const line = `${key}\t${action}\t${userName}\t${dateStr}\r\n`;
    TranslatorEngine.fs.appendFileSync(logPath, line, 'utf8');
  }

  public static CreateHistoryLog(key: string, action: string): string {
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 23) + '+07:00';
    const userName = ''; /* process.env.USERNAME placeholder */
    return `${key}\t${action}\t${userName}\t${dateStr}\n`;
  }

  public static WriteHistoryLog(historyLogs: string, logPath: string): void {
    if (!TranslatorEngine.fs.existsSync(logPath)) {
      TranslatorEngine.fs.writeFileSync(logPath, 'Entry\tAction\tUser Name\tUpdated Date\r\n', 'utf8');
    }
    TranslatorEngine.fs.appendFileSync(logPath, historyLogs, 'utf8');
  }

  // ===================================================================
  // removeIgnoredChinesePhrases
  // ===================================================================

  // ═══════════════════════════════════════════════════════════════
  //  LUẬT NHÂN — Name/Pronoun rule matching (regex-based)
  // ═══════════════════════════════════════════════════════════════

  private static removeIgnoredChinesePhrases(standardizedChinese: string): string {
    if (!standardizedChinese) {
      return '';
    }
    let text = standardizedChinese;
    for (const current of TranslatorEngine.ignoredChinesePhraseList) {
      text = text.replace(new RegExp(this.escapeRegex(current), 'g'), '');
    }
    return text.replace(/\t\n\n/g, '');
  }

  private static removeIgnoredChinesePhrasesForBrowser(standardizedChinese: string): string {
    if (!standardizedChinese) {
      return '';
    }
    let text = standardizedChinese;
    for (const current of TranslatorEngine.ignoredChinesePhraseForBrowserList) {
      text = text.replace(new RegExp(this.escapeRegex(current), 'g'), '');
    }
    return text.replace(/\t\n\n/g, '');
  }

  // ===================================================================
  // containsLuatNhan
  // ===================================================================

  private static containsLuatNhan(chinese: string, dictionary: Map<string, string>): { index: number; matchedStr?: string; matchedLength?: number } | number {
    let luatNhan = '';
    let matchedLength = -1;
    return TranslatorEngine.containsLuatNhanImpl(chinese, dictionary);
  }

  private static containsLuatNhanImpl(
    chinese: string,
    dictionary: Map<string, string>
  ): { index: number; matchedStr?: string; matchedLength?: number } {
    const length = chinese.length;
    for (const [key, value] of TranslatorEngine.luatNhanDictionary) {
      if (length >= key.length - 2) {
        const pattern = key.replace(/\{0\}/g, '([^,\\. ?]{1,10})');
        const regex = new RegExp(pattern, 'g');
        let match = regex.exec(chinese);
        let num = 0;
        while (match) {
          const matchedValue = match[1];
          if (key.startsWith('{0}')) {
            for (let i = 0; i < matchedValue.length; i++) {
              if (dictionary.has(matchedValue.substring(i))) {
                return { index: match.index + i, matchedStr: pattern, matchedLength: match[0].length - i };
              }
            }
          } else if (key.endsWith('{0}')) {
            let num2 = matchedValue.length;
            while (num2 > 0) {
              if (dictionary.has(matchedValue.substring(0, num2))) {
                return { index: match.index, matchedStr: pattern, matchedLength: match[0].length - (matchedValue.length - num2) };
              }
              num2--;
            }
          } else if (dictionary.has(matchedValue)) {
            return { index: match.index, matchedStr: pattern, matchedLength: match[0].length };
          }
          match = regex.exec(chinese);
          num++;
          if (num > 1) break;
        }
      }
    }
    return { index: -1, matchedStr: '', matchedLength: -1 };
  }

  private static matchesLuatNhan(chinese: string, dictionary: Map<string, string>): boolean {
    for (const [key] of TranslatorEngine.luatNhanDictionary) {
      const pattern = key.replace(/\{0\}/g, '(.+)');
      const regex = new RegExp('^' + pattern + '$');
      const match = regex.exec(chinese);
      if (match && dictionary.has(match[1])) {
        return true;
      }
    }
    return false;
  }

  private static matchesLuatNhanWithPattern(chinese: string, dictionary: Map<string, string>, luatNhan: string): boolean {
    const regex = new RegExp('^' + luatNhan + '$');
    const match = regex.exec(chinese);
    return !!match && dictionary.has(match[1]);
  }

  // ===================================================================
  // ChineseToLuatNhan
  // ===================================================================

  public static ChineseToLuatNhan(chinese: string, dictionary: Map<string, string>): string {
    const result = TranslatorEngine.ChineseToLuatNhanWithPattern(chinese, dictionary);
    return result.result;
  }

  public static ChineseToLuatNhanWithPattern(chinese: string, dictionary: Map<string, string>): { result: string; luatNhan: string } {
    for (const [key, value] of TranslatorEngine.luatNhanDictionary) {
      const pattern = key.replace(/\{0\}/g, '(.+)');
      const regex = new RegExp('^' + pattern + '$');
      const match = regex.exec(chinese);
      if (match && dictionary.has(match[1])) {
        const meanings = (dictionary.get(match[1]) || '').split(/[\/|]/);
        const sb: string[] = [];
        for (const meaning of meanings) {
          sb.push(value.replace(/\{0\}/g, meaning));
          sb.push('/');
        }
        return { result: sb.join('').replace(/\/$/, ''), luatNhan: key };
      }
    }
    throw new Error('Lỗi xử lý luật nhân cho cụm từ: ' + chinese);
  }
}
