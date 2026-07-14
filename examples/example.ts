import * as fs from 'fs';
import { TranslatorEngine, DictionaryConfigurationHelper, FileSystemConfig } from '../src/index';

async function main() {
  // 1. Point to your dictionary directory
  DictionaryConfigurationHelper.setDirectoryPath('examples');

  // 2. Load dictionaries (async)
  await TranslatorEngine.LoadDictionaries();

  // 3. Read source text
  const sourcePath = 'examples/doc/source.txt';
  const destPath = 'examples/doc/dest.txt';
  const rawText = fs.readFileSync(sourcePath, 'utf8');
  console.log(`Read ${rawText.length} chars from ${sourcePath}`);

  // 4. Standardize input
  const input = TranslatorEngine.StandardizeInput(rawText);

  // 5. Translate to Hán-Việt (character-by-character)
  const hv = TranslatorEngine.ChineseToHanViet(input);
  console.log(`Hán-Việt translation: ${hv.result.length} chars`);

  // 6. Translate phrases — single meaning (longest-match sliding-window)
  const vp = TranslatorEngine.ChineseToVietPhraseOneMeaning(
    input,
    0,    // wrapType: 0=plain, 1=brackets [...]
    0,    // translationAlgorithm: 0=default
    true  // prioritizedName: prefer name dictionary
  );
  console.log(`Việt phrase translation: ${vp.result.length} chars`);

  // 7. Write results to dest.txt
  const output = [
    '=== Source ===',
    rawText,
    '',
    '=== Hán-Việt ===',
    hv.result,
    '',
    '=== Việt Phrase (single meaning) ===',
    vp.result,
  ].join('\r\n');

  fs.writeFileSync(destPath, output, 'utf8');
  console.log(`\nWritten to ${destPath}`);
}

main().catch(console.error);