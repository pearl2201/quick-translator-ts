# QuickTranslator Engine — TypeScript Port Usage Guide

This document maps all usages of `TranslatorEngine` in the original C# WinForms app (`QuickTranslator/`) to the TypeScript port (`quick-translator-ts/`).

---

## 1. Lifecycle

### `LoadDictionaries()`
Called once at startup and on "Reload Dictionaries" button.

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 271 | `LoadDictionaries()` — called during `MainForm_Load` |
| `MainForm.cs` | 1300 | `LoadDictionaries()` — called on "Reload Dict" button click |

**Semantics**: Loads all dictionary text files from disk into in-memory `Map<string, string>` dictionaries. Uses parallel loading via `Promise.all()` internally.

```typescript
// TypeScript equivalent (async)
await TranslatorEngine.LoadDictionaries();
```

---

### `DictionaryDirty` (property)

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 1299 | `DictionaryDirty = true` — forces re-load on next `LoadDictionaries()` |

```typescript
TranslatorEngine.DictionaryDirty = true;
await TranslatorEngine.LoadDictionaries();
```

---

## 2. Translation Methods (Main API)

### `StandardizeInput(original: string): string`

Normalizes Chinese text before translation:
- Converts full-width CJK punctuation → half-width
- Converts full-width letters → narrow (`ToNarrow`)
- Replaces Chinese punctuation (。，：！“” etc.) with ASCII equivalents
- Inserts spaces between Chinese/non-Chinese characters
- Removes ignored Chinese phrases
- Tabs-indents each line

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 380 | `StandardizeInput(Clipboard.GetText())` — translating from clipboard |
| `MainForm.cs` | 2021 | `StandardizeInput(...)` — re-translate button |
| `MainForm.cs` | 2061 | `StandardizeInput(original)` — opening `.qt` project files |
| `MainForm.cs` | 2127 | `StandardizeInput(text)` — opening HTML/other files |
| `MainForm.cs` | 1474 | *(commented out)* |

```typescript
const normalized = TranslatorEngine.StandardizeInput(rawChineseText);
```

---

### `ChineseToHanViet(chinese: string): { result: string, mapping: CharRange[] }`

Character-by-character Chinese → Han-Vietnamese phonetic translation.
Each Chinese character is looked up in the `hanVietDictionary` and replaced with its Vietnamese phonetic reading.
Returns the translated text and an array of `CharRange` objects mapping each input char position to its output position.

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 409 | Main `translateHanViet()` — full content translation in background thread |
| `MainForm.cs` | 525 | `chineseToHanVietWithNewThread()` — threaded batch translation |
| `UpdatePhienAmForm.cs` | 69 | Preview phonetic reading as user types |
| `UpdateVietPhraseForm.cs` | 140 | Preview Han-Viet when editing phrase |

```typescript
const { result, mapping } = TranslatorEngine.ChineseToHanViet(chineseText);
// result: translated string
// mapping: CharRange[] for position mapping
```

---

### `ChineseToVietPhrase(chinese: string, wrapType: number, translationAlgorithm: number, prioritizedName: boolean): { result: string, chinesePhraseRanges: CharRange[], vietPhraseRanges: CharRange[] }`

Main phrase translation. Uses a longest-match sliding-window algorithm (max 20 chars):
1. Scans the Chinese text left-to-right
2. For each position, tries the longest matching phrase (20 chars down to 1)
3. If found in dictionary and passes algorithm checks, translates it
4. Falls back to `ChineseToHanViet` for unmatched characters
5. Applies "Luat Nhan" (name/pronoun rules) where applicable

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 459 | Main `translateVietPhrase()` — background thread with lock on `LastTranslatedWord_VietPhrase` |
| `MainForm.cs` | 532 | `chineseToVietPhraseWithNewThread()` — threaded batch translation |

**Parameters:**
- `wrapType: number` — How to wrap multi-meaning translations:
  - `0` = No brackets
  - `1` = Wrap all in `[...]`
  - Other = Auto-wrap only if word has multiple meanings
- `translationAlgorithm: number` — Algorithm variant:
  - `0` = Default (longest match in sentence)
  - `2` = Alternative variant
- `prioritizedName: boolean` — Prefer name dictionary over phrase:
  - `true` = Prioritize names
  - `false` = Normal priority

**Config values** (from `Configuration.cs`):
```typescript
const config = {
  VietPhrase_Wrap: 1,           // Configuration.VietPhrase_Wrap
  TranslationAlgorithm: 0,      // Configuration.TranslationAlgorithm
  PrioritizedName: true         // Configuration.PrioritizedName
};
```

```typescript
const { result, chinesePhraseRanges, vietPhraseRanges } = 
  TranslatorEngine.ChineseToVietPhrase(chineseText, 1, 0, true);
```

---

### `ChineseToVietPhraseOneMeaning(chinese: string, wrapType: number, translationAlgorithm: number, prioritizedName: boolean): { result: string, chinesePhraseRanges: CharRange[], vietPhraseRanges: CharRange[] }`

Same as `ChineseToVietPhrase` but uses the "one meaning" dictionaries (only the first meaning of each entry, split on `/` or `|`).

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 433 | When `Layout_VietPhrase` is true — intermediate result |
| `MainForm.cs` | 437 | When `Layout_VietPhrase` is false — main VietPhraseOneMeaning panel |
| `MainForm.cs` | 540 | `chineseToVietPhraseOneMeaningWithNewThread()` — threaded batch |

```typescript
const { result, chinesePhraseRanges, vietPhraseRanges } = 
  TranslatorEngine.ChineseToVietPhraseOneMeaning(chineseText, 1, 0, true);
```

---

## 3. Meaning Lookup

### `ChineseToMeanings(chinese: string): { result: string, phraseTranslatedLength: number }`

Multi-dictionary lookup for a starting segment of Chinese text. Tries dictionaries in this order:
1. Luat Nhan (matching with name rules)
2. VietPhrase (phrase dictionary)
3. LacViet (Lạc Việt dictionary)
4. Cedict / Babylon
5. ThieuChuu (Thiều Chửu character dictionary)
6. Chinese Phien Am English

Returns all meanings found and the length of text that was matched.

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 584 | `HanVietClick()` — show meanings when clicking a word |
| `MainForm.cs` | 625 | Meaning popup on character click |
| `MainForm.cs` | 685 | `Meaning_AddToVietPhraseHandler` |
| `MainForm.cs` | 729 | Copy-to-Viet handler |

```typescript
const { result, phraseTranslatedLength } = 
  TranslatorEngine.ChineseToMeanings(chineseSubstring);
```

---

### `GetVietPhraseOrNameValueFromKey(key: string): string | null`

Looks up a key in the combined VietPhrase + Name dictionary.

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 741 | Getting value for Viet phrase replacement |

---

### `GetVietPhraseValueFromKey(key: string): string | null`

Looks up a key in phrase-only dictionary.

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 825 | Meaning replacement — get existing meanings to append |
| `MainForm.cs` | 876 | New meaning input — get existing meanings |
| `UpdateVietPhraseForm.cs` | 141 | Pre-fill phrase value when editing |

---

### `GetNameValueFromKey(key: string): string | null`
### `GetNameValueFromKey(key: string, isNameChinh: boolean): string | null`

Looks up a key in the name dictionary.

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 141 | Pre-fill name value when editing (type==1) |
| `MainForm.cs` | 1949 | Check if a word is a name during Shift+Up reordering |
| `MainForm.cs` | 1993 | Check if highlighted word is a name |

---

## 4. Dictionary CRUD

### `UpdateVietPhraseDictionary(key: string, value: string, sorting: boolean)`

Add or update an entry in the VietPhrase dictionary and save to file.

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 838 | Adding new meaning from context menu |
| `MainForm.cs` | 890 | Adding new meaning from text input |
| `UpdateVietPhraseForm.cs` | 171 | Update button click |

**Parameters:**
- `sorting: boolean` — `true` = sort dictionary by key length descending before saving; `false` = append without sorting

---

### `UpdateNameDictionary(key: string, value: string, sorting: boolean, isNameChinh: boolean)`

Add or update an entry in the name dictionary.

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 175 | Update button click |

**Parameters:**
- `isNameChinh: boolean` — `true` = main name dict; `false` = secondary name dict

---

### `UpdatePhienAmDictionary(key: string, value: string, sorting: boolean)`

Add or update a phonetic (Han-Viet) entry. Only valid for single Chinese characters.

| File | Line | Context |
|------|------|---------|
| `UpdatePhienAmForm.cs` | 92 | Update button click |

---

### `DeleteKeyFromVietPhraseDictionary(key: string, sorting: boolean)`

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 153 | Delete button click (type==0) |

---

### `DeleteKeyFromNameDictionary(key: string, sorting: boolean, isNameChinh: boolean)`

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 157 | Delete button click (type!=0) |

---

### `DeleteKeyFromPhienAmDictionary(key: string, sorting: boolean)`

| File | Line | Context |
|------|------|---------|
| `UpdatePhienAmForm.cs` | 98 | Delete button click |

---

## 5. Dictionary Counts

### `GetVietPhraseDictionaryCount(): number`

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 122 | Display entry count label |

---

### `GetNameDictionaryCount(isNameChinh: boolean): number`

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 122 | Display entry count (type==1 for main names) |

---

### `GetPhienAmDictionaryCount(): number`

| File | Line | Context |
|------|------|---------|
| `UpdatePhienAmForm.cs` | 55 | Display entry count label |

---

## 6. History Management

### `GetVietPhraseHistoryLogRecord(key: string): string`

Returns formatted text showing who last modified an entry and when.

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 145 | Display "Updated by" label (type==0) |

---

### `GetNameHistoryLogRecord(key: string, isNameChinh: boolean): string`

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 145 | Display "Updated by" label (type!=0) |

---

### `CompressOnlyVietPhraseDictionaryHistory()`
### `CompressOnlyNameDictionaryHistory(isNameChinh: boolean)`

Write in-memory history cache to file.

| File | Line | Context |
|------|------|---------|
| `UpdateVietPhraseForm.cs` | 187 | `CompressOnlyVietPhraseDictionaryHistory()` |
| `UpdateVietPhraseForm.cs` | 190 | `CompressOnlyNameDictionaryHistory(type==1)` |

---

## 7. Utility Methods

### `IsChinese(character: string): boolean`

Checks if a single character exists in the Han-Viet dictionary (indicating it's Chinese).

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 2276 | Check if typing Chinese character |

---

### `ExistInPhienAmDictionary(chinese: string): boolean`

Checks if a single Chinese character has a phonetic entry.

| File | Line | Context |
|------|------|---------|
| `UpdatePhienAmForm.cs` | 76 | Enable/disable delete button based on existence |

---

### `AddIgnoredChinesePhrase(phrase: string)`

Adds a phrase to the ignored list so it's skipped during translation.

| File | Line | Context |
|------|------|---------|
| `MainForm.cs` | 1884 | Delete-selected-text handler |

---

## Configuration Reference

These are the default configuration values used when calling translation methods:

| Property | Default | Description |
|----------|---------|-------------|
| `VietPhrase_Wrap` | `1` | Wrap type for VietPhrase translation |
| `VietPhraseOneMeaning_Wrap` | `1` | Wrap type for one-meaning translation |
| `TranslationAlgorithm` | `0` | Algorithm variant |
| `PrioritizedName` | `true` | Prefer name dictionary matches |

---

## Type Translation Cheat Sheet

| C# Type | TypeScript Equivalent |
|---------|----------------------|
| `string` | `string` |
| `int` | `number` |
| `bool` | `boolean` |
| `Dictionary<string, string>` | `Map<string, string>` |
| `List<string>` | `string[]` |
| `CharRange[]` | `CharRange[]` |
| `out int` | Returned as object property |
| `out CharRange[]` | Returned as object property |
| `ref` param | Mutable approach or returned value |
| `DataSet` | `Map<string, string>` |
