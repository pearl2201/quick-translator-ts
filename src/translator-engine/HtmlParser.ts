import { IFileSystem } from '../io/IFileSystem';
import { FileSystemConfig } from '../io/FileSystemConfig';

/**
 * Extracts Chinese text content from HTML by matching configurable
 * title/content/removed tag patterns (loaded from .config files).
 *
 * Useful for extracting the main readable content from Chinese novel
 * websites while discarding navigation, ads, etc.
 *
 * Uses FileSystemConfig.instance for file I/O.
 */
export class HtmlParser {
  private static titleTags: string[] = [];
  private static contentTags: string[] = [];
  private static removedTags: string[] = [];
  private static dirty = true;
  private static directoryPath: string = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '/';

  static setDirectoryPath(dirPath: string): void {
    this.directoryPath = dirPath;
    this.dirty = true;
  }

  /**
   * Extract Chinese text from HTML content.
   * @param needMarkChapterHeaders - Prepend $CHAPTER_HEADER$ marker to extracted titles
   */
  static GetChineseContent(htmlContent: string, needMarkChapterHeaders: boolean): string {
    this.LoadConfiguration();

    const result: string[] = [];

    // Process title tags — extract chapter/section headings
    for (const tag of this.titleTags) {
      if (tag && !tag.startsWith('#')) {
        const lowerHtml = htmlContent.toLowerCase();
        const lowerTag = tag.toLowerCase();
        if (lowerHtml.includes(lowerTag)) {
          const afterTag = htmlContent.substring(lowerHtml.indexOf(lowerTag) + tag.length);
          const tagName = tag.substring(tag.lastIndexOf('<') + 1);
          const tagNameClean = tagName.substring(0, Math.max(
            tagName.indexOf(' '),
            tagName.indexOf('>') >= 0 ? tagName.indexOf('>') : tagName.length
          ));

          const closeTag = `</${tagNameClean.toLowerCase()}>`;
          if (afterTag.toLowerCase().includes(closeTag)) {
            const content = afterTag.substring(0, afterTag.toLowerCase().indexOf(closeTag));
            result.push(
              (needMarkChapterHeaders ? '$CHAPTER_HEADER$. ' : '') +
              content.trimStart()
            );
            break;
          }
        }
      }
    }

    // Process content tags — extract main body text
    for (const tag of this.contentTags) {
      if (tag && !tag.startsWith('#')) {
        const lowerHtml = htmlContent.toLowerCase();
        const lowerTag = tag.toLowerCase();
        if (lowerHtml.includes(lowerTag)) {
          const afterTag = htmlContent.substring(lowerHtml.indexOf(lowerTag) + tag.length);

          if (tag === '<!--bodybegin-->') {
            const endTag = '<!--bodyend-->';
            if (afterTag.includes(endTag)) {
              result.push(afterTag.substring(0, afterTag.toLowerCase().indexOf(endTag.toLowerCase())));
            }
          } else {
            const tagName = tag.substring(tag.lastIndexOf('<') + 1);
            const tagNameClean = tagName.substring(0, Math.max(
              tagName.indexOf(' '),
              tagName.indexOf('>') >= 0 ? tagName.indexOf('>') : tagName.length
            )).replace(/^\//, '');

            const closeTag = `</${tagNameClean.toLowerCase()}>`;
            if (afterTag.toLowerCase().includes(closeTag)) {
              result.push(afterTag.substring(0, afterTag.toLowerCase().indexOf(closeTag)));
              break;
            }
          }
        }
      }
    }

    let text = result.join('');

    // Remove specified HTML fragments
    for (const tag of this.removedTags) {
      if (tag && !tag.startsWith('#')) {
        text = text.split(tag).join('');
      }
    }

    // Normalize common block-level tags to newlines, strip entities
    text = text
      .replace(/<p>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, '')
      .replace(/&lt;/g, '')
      .replace(/&gt;/g, '');

    // Strip all remaining HTML tags
    text = text.replace(/<[^>]*>/g, '');

    return text;
  }

  private static LoadConfiguration(): void {
    if (!this.dirty) return;

    this.titleTags = this.readConfigLines('HtmlChapterTitleTags.config');
    this.contentTags = this.readConfigLines('HtmlChapterContentTags.config');
    this.removedTags = this.readConfigLines('HtmlRemovedTags.config');
    this.dirty = false;
  }

  /** Read a config file, one line per entry. */
  private static readConfigLines(filename: string): string[] {
    try {
      const fs: IFileSystem = FileSystemConfig.instance;
      const filePath = fs.join(this.directoryPath, filename);
      return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    } catch {
      return [];
    }
  }
}
