# Architecture — QuickTranslator Engine (TypeScript)

> Port of the original C# `TranslatorEngine` from the QuickTranslator WinForms app.

---

## 1. Overview

The engine is a **Chinese → Vietnamese translation library** organized into three layers:

```
┌─────────────────────────────────────────────────────┐
│                 TRANSLATOR ENGINE                    │
│  ChineseToHanViet · ChineseToVietPhrase · etc.       │
├─────────────────────────────────────────────────────┤
│              SUPPORT SERVICES                        │
│  HtmlParser · CharsetDetector · DictionaryConfig     │
│  ApplicationLog · Notifier · CharRange               │
├─────────────────────────────────────────────────────┤
│            CHARDET (Charset Detection)               │
│  nsPSMDetector · nsVerifier · nsEUCSampler · etc.   │
├─────────────────────────────────────────────────────┤
│                    I/O LAYER                         │
│  IFileSystem (interface)                             │
│  NodeFileSystem · FileSystemConfig                   │
└─────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
quick-translator-ts/
├── src/
│   ├── index.ts                          # Public API exports
│   │
│   ├── io/                               # I/O abstraction layer
│   │   ├── IFileSystem.ts                #   File system interface
│   │   ├── NodeFileSystem.ts             #   Node.js implementation
│   │   ├── FileSystemConfig.ts           #   Central config singleton
│   │   └── index.ts                      #   Re-exports
│   │
│   ├── translator-engine/                # Core translation engine
│   │   ├── TranslatorEngine.ts           #   Main engine (~2,400 lines)
│   │   ├── CharRange.ts                  #   Position range tracking
│   │   ├── DictionaryConfigurationHelper.ts  # Dictionary path resolver
│   │   ├── HtmlParser.ts                 #   Chinese content extractor
│   │   ├── CharsetDetector.ts            #   File encoding detection
│   │   ├── ApplicationLog.ts             #   Error logging
│   │   └── Notifier.ts                   #   Chardet callback
│   │
│   └── chardet/                          # Mozilla charset detection (ported)
│       ├── nsDetector.ts                 #   Main detector entry point
│       ├── nsPSMDetector.ts              #   Probabilistic state machine
│       ├── nsVerifier.ts                 #   Abstract encoding verifier
│       ├── nsEUCStatistics.ts            #   Abstract frequency statistics
│       ├── nsEUCSampler.ts               #   Byte sampling & scoring
│       ├── nsICharsetDetector.ts         #   Detector interface
│       ├── nsICharsetDetectionObserver.ts #   Observer interface
│       ├── nsUTF8Verifier.ts             #   UTF-8 verifier
│       ├── nsGB2312Verifier.ts           #   GB2312 verifier
│       ├── nsBIG5Verifier.ts             #   Big5 verifier
│       ├── nsSJISVerifier.ts             #   Shift_JIS verifier
│       ├── ... (12 more encoding verifiers)
│       ├── GB2312Statistics.ts           #   GB2312 frequency data
│       ├── Big5Statistics.ts             #   Big5 frequency data
│       └── ... (3 more statistics files)
│
├── USAGE.md                              # API usage reference
├── ARCHITECTURE.md                       # This file
├── README.md                             # Project README
├── package.json
└── tsconfig.json
```

---

## 3. Module Descriptions

### 3.1 `io/` — I/O Abstraction

| Class | Purpose |
|-------|---------|
| `IFileSystem` | Interface for all file operations (`read`, `write`, `exists`, `copy`, `path` helpers) |
| `NodeFileSystem` | Production implementation wrapping Node.js `fs` + `path` |
| `FileSystemConfig` | Central singleton holding the shared `IFileSystem` instance |

**Design rationale**: Every class that touches the filesystem reads from `FileSystemConfig.instance`. This single point of control allows:
- **Testing**: Swap with a mock filesystem to avoid touching real disk
- **Portability**: Swap with a browser adapter (e.g., using the File System Access API)

```typescript
// Set once — propagates everywhere
TranslatorEngine.configureFileSystem(new MockFileSystem());
```

### 3.2 `translator-engine/` — Core Translation

#### `TranslatorEngine` (the main class)

This is the heart of the library — a static class with **~2,400 lines** implementing all translation algorithms.

**In-memory dictionaries** (all `Map<string, string>`):

| Dictionary | Content | Lookup |
|-----------|---------|--------|
| `hanVietDictionary` | Single Chinese char → Hán-Việt | `ChineseToHanViet()` |
| `vietPhraseDictionary` | Phrases → Vietnamese (merged) | `ChineseToVietPhrase()` |
| `onlyVietPhraseDictionary` | Phrases only (no names) | `GetVietPhraseValueFromKey()` |
| `onlyNameDictionary` | Name entries only (combined) | `GetNameValueFromKey()` |
| `onlyNameChinhDictionary` | Main name dictionary | CRUD (isNameChinh=true) |
| `onlyNamePhuDictionary` | Secondary name dictionary | CRUD (isNameChinh=false) |
| `thieuChuuDictionary` | Thiều Chửu character dictionary | `ChineseToMeanings()` |
| `lacVietDictionary` | Lạc Việt dictionary | `ChineseToMeanings()` |
| `cedictDictionary` | CC-CEDICT + Babylon merged | `ChineseToMeanings()` |
| `chinesePhienAmEnglishDictionary` | English phonetic readings | `ChineseToMeanings()` |
| `luatNhanDictionary` | Luật Nhân (name/pronoun rules) | Algorithm matching |
| `pronounDictionary` | Pronoun entries | Nhan algorithm |

**Key methods**:

| Method | Description |
|--------|-------------|
| `LoadDictionaries()` | Async — loads all dictionaries from disk in parallel via `Promise.all()` |
| `StandardizeInput(text)` | Normalize Chinese text (punctuation, spacing, full-width→half-width) |
| `ChineseToHanViet(text)` | Character-by-character Hán-Việt translation |
| `ChineseToVietPhrase(text, wrapType, algo, prioritizedName)` | Longest-match phrase translation |
| `ChineseToVietPhraseOneMeaning(text, ...)` | Same but first meaning only |
| `ChineseToMeanings(text)` | Multi-dictionary meaning lookup |
| `ChineseToLuatNhan(text, dict)` | Regex-based name/pronoun rule translation |
| `SaveDictionaryToFile(dict, path)` | Persist with backup/rollback safety |

#### Supporting classes

| Class | Purpose |
|-------|---------|
| `CharRange` | `{ startIndex, length }` value object for position tracking |
| `DictionaryConfigurationHelper` | Reads `Dictionaries.config` to resolve dictionary file paths |
| `HtmlParser` | Extracts Chinese text from HTML using configurable tag patterns |
| `CharsetDetector` | Wraps chardet for file encoding detection |
| `ApplicationLog` | File-based exception logger with rotation |
| `Notifier` | Chardet callback — stores detected charset |

### 3.3 `chardet/` — Mozilla Charset Detection

A direct port of the Mozilla Universal Charset Detector from C# to TypeScript.

**How it works**:
1. `nsDetector` is initialized with a language flag (CHINESE, JAPANESE, etc.)
2. On `initVerifiers()`, encoding-specific `nsVerifier` instances are set up
3. During `DoIt()`, byte data is fed through all verifiers in a probabilistic state machine
4. Verifiers that reach `eError` state are eliminated; one reaching `eItsMe` wins
5. If no verifier matches, statistical sampling (`nsEUCSampler` + `nsEUCStatistics`) scores the encodings

**15 encoding verifiers**: UTF-8, GB2312, GB18030, Big5, EUC-JP, EUC-KR, EUC-TW, Shift_JIS, ISO-2022-JP, ISO-2022-KR, ISO-2022-CN, HZ-GB-2312, windows-1252, UTF-16BE, UTF-16LE

**5 frequency statistic sets**: Big5, EUC-JP, EUC-KR, EUC-TW, GB2312

---

## 4. Data Flow

### 4.1 Translation Pipeline

```
Input Chinese text
       │
       ▼
StandardizeInput()
  • Full-width → half-width
  • CJK punctuation → ASCII
  • Insert spacing
  • Remove ignored phrases
       │
       ├──► ChineseToHanViet()
       │      Per-character lookup → Hán-Việt reading
       │      Returns CharRange[] mapping
       │
       ├──► ChineseToVietPhrase()
       │      Sliding window (max 20 chars)
       │      • Longest-match in dictionary
       │      • Falls back to ChineseToHanViet()
       │      • Applies Luật Nhân rules
       │      • Returns CharRange[] for positions
       │
       ├──► ChineseToVietPhraseOneMeaning()
       │      Same algorithm, single meaning per entry
       │
       └──► ChineseToMeanings()
              Multi-dictionary lookup order:
              1. Luật Nhân → 2. VietPhrase → 3. Lạc Việt
              4. CC-CEDICT → 5. Thiều Chửu → 6. English Phonetics
```

### 4.2 Dictionary Loading

```
LoadDictionaries()
       │
       ▼
  Parallel (Promise.all):
  ├── loadHanVietDictionary()
  ├── loadThieuChuuDictionary()
  ├── loadLacVietDictionary()
  ├── loadCedictDictionary()
  ├── loadChinesePhienAmEnglishDictionary()
  ├── loadPronounDictionary()
  ├── loadLuatNhanDictionary()
  ├── loadOnlyVietPhraseDictionary()
  ├── loadOnlyNameDictionary()
  ├── loadIgnoredChinesePhraseLists()
  └── History loads (4x)
       │
       ▼
  Sequential (after Promise.all resolves):
  ├── loadVietPhraseDictionary()          # merges name + phrase
  ├── vietPhraseDictionary → toOneMeaning
  ├── pronounDictionary → toOneMeaning
  ├── loadNhanByDictionary()
  └── loadNhanByOneMeaningDictionary()
```

---

## 5. Key Design Decisions

### 5.1 Static Class Architecture
The original C# used all static members. The TypeScript port preserves this for simplicity and direct method access. All state is in static `Map` fields.

### 5.2 Async Dictionary Loading
C# used `ThreadPool.QueueUserWorkItem` + `ManualResetEvent` + `WaitHandle.WaitAll`. The TS port uses `async/await` with `Promise.all()` for parallel loading.

### 5.3 `out` Parameters → Return Objects
C# `out` parameters (e.g., `out CharRange[] mapping`) are replaced with return objects:
```typescript
// C#: string ChineseToHanViet(string chinese, out CharRange[] mapping);
// TS:  { result: string; mapping: CharRange[] }
```

### 5.4 `DataTable` / `DataSet` → `Map`
C# `System.Data.DataSet` for history tracking is replaced with `Map<string, HistoryEntry>`.

### 5.5 File I/O Abstraction
All file operations go through `IFileSystem`, making the engine testable without touching the real filesystem.

### 5.6 Packed Bit Arrays → Unchanged
The chardet verifiers use machine-generated bit-packed integer arrays for character classification and state transition tables. These are preserved exactly as in C# to maintain correctness.

---

## 6. Extension Points

| Point | How to extend |
|-------|---------------|
| **New dictionary format** | Add loader method + new `Map` field |
| **New translation algorithm** | Add method following `ChineseToVietPhrase()` pattern |
| **New encoding detector** | Create verifier class extending `nsVerifier`, add to `initVerifiers()` |
| **Non-Node.js environment** | Implement `IFileSystem` adapter (e.g., browser, Deno) |
| **Custom dictionary paths** | Override `DictionaryConfigurationHelper.setDirectoryPath()` |

---

## 7. Configuration

The engine is configured via `Dictionaries.config` (key=value text file):

```ini
# Dictionary file paths (relative to config dir or absolute)
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

# Algorithm selection (1=pronouns, 2=pronouns+names, 3=pronouns+names+phrases)
ThuatToanNhan=1
```

---

## 8. Build & Test

```bash
npm run build      # Compile TypeScript → dist/
npm test           # Run Jest tests
npm run clean      # Remove dist/
```
