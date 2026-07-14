// ── Translator Engine — public API ──
// Re-export all public classes for a single entry-point import.
// Usage: import { TranslatorEngine, IFileSystem, ... } from './src';

export { CharRange } from './translator-engine/CharRange';
export { ApplicationLog } from './translator-engine/ApplicationLog';
export { DictionaryConfigurationHelper } from './translator-engine/DictionaryConfigurationHelper';
export { CharsetDetector } from './translator-engine/CharsetDetector';
export { Notifier } from './translator-engine/Notifier';
export { HtmlParser } from './translator-engine/HtmlParser';
export { TranslatorEngine } from './translator-engine/TranslatorEngine';

// ── I/O abstraction ──
export { IFileSystem, NodeFileSystem, FileSystemConfig } from './io';
