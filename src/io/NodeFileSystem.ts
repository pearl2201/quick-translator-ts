/**
 * NodeFileSystem — IFileSystem implementation backed by Node.js 'fs' and 'path'.
 *
 * This is the default implementation used at runtime.  Replace it with a mock
 * in unit tests or with a browser adapter for Web-only environments.
 */
import * as fs from 'fs';
import * as path from 'path';
import { IFileSystem } from './IFileSystem';

export class NodeFileSystem implements IFileSystem {
  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  readFileSync(filePath: string, encoding?: string): string {
    return fs.readFileSync(filePath, (encoding ?? 'utf8') as BufferEncoding);
  }

  writeFileSync(filePath: string, data: string, encoding?: string): void {
    fs.writeFileSync(filePath, data, (encoding ?? 'utf8') as BufferEncoding);
  }

  appendFileSync(filePath: string, data: string, encoding?: string): void {
    fs.appendFileSync(filePath, data, (encoding ?? 'utf8') as BufferEncoding);
  }

  copyFileSync(src: string, dest: string): void {
    fs.copyFileSync(src, dest);
  }

  unlinkSync(filePath: string): void {
    fs.unlinkSync(filePath);
  }

  statSync(filePath: string): { size: number } {
    return fs.statSync(filePath);
  }

  openSync(filePath: string, flags: string): number {
    return fs.openSync(filePath, flags);
  }

  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number): number {
    return fs.readSync(fd, buffer, offset, length, position);
  }

  closeSync(fd: number): void {
    fs.closeSync(fd);
  }

  // ── Path helpers ──

  join(...paths: string[]): string {
    return path.join(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  extname(filePath: string): string {
    return path.extname(filePath);
  }

  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }
}
