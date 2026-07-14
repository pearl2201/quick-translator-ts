# QuickTranslator Engine

> TypeScript port of the `TranslatorEngine` from the [QuickTranslator](https://github.com/dynamotn/QuickTranslator) WinForms application — a Chinese-to-Vietnamese translation engine.

[![License: MPL 1.1/GPL 2.0/LGPL 2.1](https://img.shields.io/badge/license-MPL%201.1%20%7C%20GPL%202.0%20%7C%20LGPL%202.1-blue.svg)](LICENSE)

---

## Features

- **Hán-Việt (Sino-Vietnamese)** — Character-by-character Chinese → Vietnamese phonetic reading
- **Việt Phrase** — Multi-character phrase translation with longest-match sliding-window algorithm
- **Multi-dictionary lookup** — Searches Thiều Chửu, Lạc Việt, CC-CEDICT, Babylon, and English phonetics
- **Luật Nhân** — Regex-based name/pronoun contextual translation rules
- **Input standardization** — Full-width/half-width conversion, CJK punctuation normalization
- **Charset detection** — Automatic file encoding detection (ported from Mozilla chardet)
- **HTML content extraction** — Extract Chinese text from web pages via configurable tag patterns
- **Dictionary CRUD** — Add, update, delete entries with file persistence and backup safety
- **History tracking** — Per-entry audit log (who changed what, when)
- **IFileSystem abstraction** — All file I/O goes through an interface; swap for testing or browser

---

## Quick Start

```bash
npm install
npm run build
```

### Usage

```typescript
import { TranslatorEngine, FileSystemConfig } from 'quick-translator-engine';

// (Optional) Use a custom file system — defaults to Node.js fs
// FileSystemConfig.setInstance(new MyCustomFileSystem());

// 1. Point to your dictionary directory
DictionaryConfigurationHelper.setDirectoryPath('/path/to/dictionaries');

// 2. Load dictionaries (async)
await TranslatorEngine.LoadDictionaries();

// 3. Standardize input
const input = TranslatorEngine.StandardizeInput('中文測試');

// 4. Translate to Hán-Việt
const hv = TranslatorEngine.ChineseToHanViet('中文');
console.log(hv.result); // "Trung văn"

// 5. Translate phrases
const vp = TranslatorEngine.ChineseToVietPhrase(
  '中文測試',
  1,    // wrapType: 0=plain, 1=brackets [...]
  0,    // translationAlgorithm: 0=default
  true  // prioritizedName: prefer name dictionary
);
console.log(vp.result);

// 6. Lookup meanings
const meanings = TranslatorEngine.ChineseToMeanings('中');
console.log(meanings.result);
```

---

## Installation

```bash
npm install quick-translator-engine
```

Requires Node.js 18+.

### Dependencies

| Package | Purpose |
|---------|---------|
| `iconv-lite` | Character encoding conversion for legacy Chinese files |

---

## API Reference

### Translation

| Method | Description |
|--------|-------------|
| `LoadDictionaries()` | Load all dictionaries from disk (async) |
| `StandardizeInput(text)` | Normalize Chinese text |
| `ChineseToHanViet(text)` | Character-level Hán-Việt translation |
| `ChineseToHanVietForBrowser(text)` | Browser-optimized variant |
| `ChineseToHanVietForBatch(text)` | Batch processing variant |
| `ChineseToHanVietForAnalyzer(text)` | Analyzer variant |
| `ChineseToVietPhrase(text, wrapType, algo, prioritizedName)` | Main phrase translation |
| `ChineseToVietPhraseForBrowser(text, ...)` | Browser variant |
| `ChineseToVietPhraseForBatch(text, ...)` | Batch variant |
| `ChineseToVietPhraseForAnalyzer(text, ...)` | Analyzer variant |
| `ChineseToVietPhraseOneMeaning(text, ...)` | Single-meaning phrase translation |
| `ChineseToVietPhraseOneMeaningForBrowser/Proxy/Batch(text, ...)` | Variants |
| `ChineseToNameForBatch(text)` | Batch name translation |
| `ChineseToMeanings(text)` | Multi-dictionary meaning lookup |
| `ChineseToLuatNhan(text, dictionary)` | Luật Nhân rule-based translation |

### Dictionary Lookup

| Method | Description |
|--------|-------------|
| `GetVietPhraseOrNameValueFromKey(key)` | Lookup in combined dictionary |
| `GetVietPhraseValueFromKey(key)` | Lookup in phrase-only dictionary |
| `GetNameValueFromKey(key, isNameChinh?)` | Lookup in name dictionary |
| `IsInVietPhrase(key)` | Check if key exists in phrase dictionary |
| `ExistInPhienAmDictionary(key)` | Check single-char phonetic entry |
| `GetVietPhraseDictionaryCount()` | Phrase dictionary size |
| `GetNameDictionaryCount(isNameChinh)` | Name dictionary size |
| `GetPhienAmDictionaryCount()` | Phonetic dictionary size |

### Dictionary CRUD

| Method | Description |
|--------|-------------|
| `UpdateVietPhraseDictionary(key, value, sorting)` | Add/update phrase entry |
| `UpdateNameDictionary(key, value, sorting, isNameChinh)` | Add/update name entry |
| `UpdatePhienAmDictionary(key, value, sorting)` | Add/update phonetic entry |
| `DeleteKeyFromVietPhraseDictionary(key, sorting)` | Delete phrase entry |
| `DeleteKeyFromNameDictionary(key, sorting, isNameChinh)` | Delete name entry |
| `DeleteKeyFromPhienAmDictionary(key, sorting)` | Delete phonetic entry |
| `SaveDictionaryToFile(dict, path)` | Save with backup safety |
| `SaveDictionaryToFileWithoutSorting(dict, path)` | Save without sorting |
| `AddIgnoredChinesePhrase(phrase)` | Add to ignore list |

### History

| Method | Description |
|--------|-------------|
| `GetVietPhraseHistoryLogRecord(key)` | Get history for phrase entry |
| `GetNameHistoryLogRecord(key, isNameChinh)` | Get history for name entry |
| `CompressOnlyVietPhraseDictionaryHistory()` | Flush history cache to file |
| `CompressOnlyNameDictionaryHistory(isNameChinh)` | Flush history cache to file |

### Utilities

| Method | Description |
|--------|-------------|
| `IsChineseChar(char)` | Check if character is Chinese |
| `IsAllChinese(text)` | Check if entire string is Chinese |
| `ToSimplified(text)` | Convert to Simplified Chinese *(placeholder)* |
| `ToWide(text)` | Convert to full-width |
| `ToNarrow(text)` | Convert to half-width |

### Supporting Classes

| Class | Description |
|-------|-------------|
| `CharRange` | `{ startIndex, length }` position tracker |
| `DictionaryConfigurationHelper` | Reads `Dictionaries.config` for file paths |
| `CharsetDetector` | Detects file encoding via Mozilla chardet |
| `HtmlParser` | Extracts Chinese content from HTML |
| `ApplicationLog` | File-based exception logger |
| `Notifier` | Chardet callback observer |
| `IFileSystem` | File system abstraction interface |
| `NodeFileSystem` | Default Node.js implementation |
| `FileSystemConfig` | Central IFileSystem configuration |

---

## Configuration

### Dictionaries.config

Place a `Dictionaries.config` file in your working directory (or set via `DictionaryConfigurationHelper.setDirectoryPath()`):

```ini
VietPhrase=dictionaries/VietPhrase.txt
Names=dictionaries/Names.txt
NamesPhu=dictionaries/NamesPhu.txt
ChinesePhienAmWords=dictionaries/ChinesePhienAmWords.txt
ThieuChuu=dictionaries/ThieuChuu.txt
LacViet=dictionaries/LacViet.txt
CEDict=dictionaries/CEDict.txt
Babylon=dictionaries/Babylon.txt
ChinesePhienAmEnglishWords=dictionaries/ChinesePhienAmEnglishWords.txt
LuatNhan=dictionaries/LuatNhan.txt
Pronouns=dictionaries/Pronouns.txt
IgnoredChinesePhrases=dictionaries/IgnoredChinesePhrases.txt
ThuatToanNhan=1
```

### HTML config files

These control how `HtmlParser` extracts content:
- `HtmlChapterTitleTags.config` — Patterns for chapter/section title tags
- `HtmlChapterContentTags.config` — Patterns for main content tags
- `HtmlRemovedTags.config` — HTML fragments to strip

### Wrap Types (`wrapType`)

| Value | Behavior |
|-------|----------|
| `0` | Plain output, no brackets |
| `1` | Wrap all multi-meaning words in `[...]` |
| Other | Auto-wrap only words with multiple meanings |

### Translation Algorithm (`translationAlgorithm`)

| Value | Behavior |
|-------|----------|
| `0` | Default longest-match algorithm |
| `2` | Alternative variant |

---

## Custom File System

The engine uses an `IFileSystem` abstraction for all file I/O. This makes it easy to:

**Test without touching disk:**
```typescript
class MockFileSystem implements IFileSystem {
  private files = new Map<string, string>();
  readFileSync(path: string): string { return this.files.get(path) || ''; }
  existsSync(path: string): boolean { return this.files.has(path); }
  writeFileSync(path: string, data: string): void { this.files.set(path, data); }
  // ... implement other methods
}

FileSystemConfig.setInstance(new MockFileSystem());
```

**Use in a browser** (with File System Access API or similar):
```typescript
class BrowserFileSystem implements IFileSystem { /* ... */ }
FileSystemConfig.setInstance(new BrowserFileSystem());
```

---

## Project Structure

```
src/
├── index.ts                    # Public exports
├── io/                         # I/O abstraction
│   ├── IFileSystem.ts          #   Interface
│   ├── NodeFileSystem.ts       #   Node.js impl
│   ├── FileSystemConfig.ts     #   Central config
│   └── index.ts
├── translator-engine/          # Core engine
│   ├── TranslatorEngine.ts     #   Main class
│   ├── CharRange.ts            #   Position helper
│   ├── DictionaryConfigurationHelper.ts
│   ├── HtmlParser.ts
│   ├── CharsetDetector.ts
│   ├── ApplicationLog.ts
│   └── Notifier.ts
└── chardet/                    # Mozilla charset detection
    ├── nsDetector.ts           #   Entry point
    ├── nsPSMDetector.ts        #   State machine
    ├── nsVerifier.ts           #   Abstract verifier
    ├── nsEUCSampler.ts         #   Byte sampler
    ├── nsEUCStatistics.ts      #   Abstract statistics
    ├── *Verifier.ts (15 files) #   Encoding verifiers
    └── *Statistics.ts (5 files)#   Frequency data
```

---

## Building

```bash
npm run build      # tsc → dist/
```

Output: `dist/` with `index.js`, `index.d.ts`, and source maps.

## Testing

```bash
npm test           # Jest
npm run test:watch # Watch mode
```

---

## License

This project is a port of the Mozilla Universal Charset Detector and the QuickTranslator application.  
See the original C# source files for license information (MPL 1.1 / GPL 2.0 / LGPL 2.1).

---

## Related

- [QuickTranslator](https://github.com/dynamotn/QuickTranslator) — The original WinForms application
