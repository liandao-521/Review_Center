import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

@Injectable()
export class StorageService implements OnModuleInit {
  readonly root = resolve(process.env.DATA_DIR ?? '../../.data');
  readonly uploads = join(this.root, 'uploads');

  async onModuleInit() {
    await mkdir(this.uploads, { recursive: true });
  }

  async save(buffer: Buffer, originalName: string, allowed: string[]) {
    const ext = extname(originalName).toLowerCase();
    if (!allowed.includes(ext)) throw new Error(`不支持的文件格式：${ext || '未知'}`);
    const fileName = `${randomUUID()}${ext}`;
    await writeFile(join(this.uploads, fileName), buffer, { flag: 'wx' });
    return fileName;
  }

  path(fileName: string) {
    if (fileName !== fileName.replace(/[^a-zA-Z0-9._-]/g, '')) throw new Error('无效文件名');
    return join(this.uploads, fileName);
  }

  async remove(fileName?: string | null) {
    if (!fileName) return;
    await unlink(this.path(fileName)).catch(() => undefined);
  }
}
