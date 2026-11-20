import {
  BadRequestException, Body, Controller, ForbiddenException, NotFoundException, OnApplicationBootstrap,
  Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SessionGuard } from './session.guard';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

type UploadFile = { buffer: Buffer };
type PackageImage = { fileName: string; originalName: string; rotation: number; displayScale: number; position: number };
type PackageQuestion = {
  id: string; subject: string; questionType?: string | null; grade?: string | null; content: string;
  answer?: string; explanation?: string; pageNumber?: number | null; majorNumber?: number | null; minorNumber?: number | null;
  tags: string[]; images: PackageImage[];
};
type PaperPackage = {
  format: 'review-center-paper-package'; version: 1;
  paper: { id: string; title: string; subject: string; grade?: string | null };
  questions: PackageQuestion[];
};

@Controller('question-packages')
@UseGuards(SessionGuard)
export class QuestionPackagesController implements OnApplicationBootstrap {
  private readonly stagingDirectory: string;
  private readonly stagingTtlMs = 30 * 60 * 1000;

  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {
    this.stagingDirectory = join(storage.root, 'staged-imports');
  }

  async onApplicationBootstrap() {
    await mkdir(this.stagingDirectory, { recursive: true });
    await this.removeExpiredPackages();
  }

  @Post('export')
  async export(@Req() request: Request, @Body() body: { paperId?: unknown }, @Res() response: Response) {
    const { accountId } = (request as any).auth;
    if (typeof body?.paperId !== 'string' || !body.paperId.trim()) throw new BadRequestException('请选择要导出的个人试卷');
    const paper = await this.prisma.paper.findFirst({ where: { id: body.paperId, scope: 'PERSONAL', ownerAccountId: accountId } });
    if (!paper) throw new NotFoundException('找不到这份个人试卷');
    const questions = await this.prisma.question.findMany({ where: { paperId: paper.id }, orderBy: [{ majorNumber: 'asc' }, { minorNumber: 'asc' }, { createdAt: 'asc' }], include: { tags: { include: { tag: true } }, images: { orderBy: { position: 'asc' } } } });
    const manifest: PaperPackage = {
      format: 'review-center-paper-package', version: 1,
      paper: { id: paper.id, title: paper.title, subject: paper.subject, grade: paper.grade },
      questions: questions.map((question) => ({
        id: question.id, subject: question.subject, questionType: question.questionType, grade: question.grade,
        content: question.content, answer: question.answer, explanation: question.explanation,
        pageNumber: question.pageNumber, majorNumber: question.majorNumber, minorNumber: question.minorNumber,
        tags: question.tags.map((item) => item.tag.name),
        images: question.images.map((image) => ({ fileName: image.fileName, originalName: image.originalName, rotation: image.rotation, displayScale: image.displayScale, position: image.position })),
      })),
    };
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    for (const image of questions.flatMap((question) => question.images)) zip.addFile(`images/${image.fileName}`, await readFile(this.storage.path(image.fileName)));
    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="review-center-paper-${stamp}.zip"`);
    response.send(zip.toBuffer());
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 250 * 1024 * 1024 } }))
  async preview(@Req() request: Request, @UploadedFile() file?: UploadFile) {
    this.requireClassAdmin(request);
    if (!file) throw new BadRequestException('请选择整卷 ZIP 文件');
    const { manifest } = this.parsePackage(file.buffer);
    const { accountId, classroomId } = (request as any).auth;
    const existingPaper = await this.prisma.paper.findFirst({ where: { classroomId, scope: 'CLASSROOM', originId: manifest.paper.id } });
    const sharedPapers = existingPaper ? [] : await this.prisma.paper.findMany({ where: { classroomId, scope: 'CLASSROOM' }, select: { id: true, title: true } });
    const titleConflict = sharedPapers.find((paper) => paper.title.trim().toLocaleLowerCase() === manifest.paper.title.trim().toLocaleLowerCase()) ?? null;
    const existingQuestions = existingPaper ? await this.prisma.question.findMany({ where: { paperId: existingPaper.id, originId: { in: manifest.questions.map((question) => question.id) } }, select: { originId: true } }) : [];
    const existingQuestionIds = new Set(existingQuestions.map((question) => question.originId));
    const token = randomUUID();
    await writeFile(join(this.stagingDirectory, `${accountId}-${token}.zip`), file.buffer, { flag: 'wx' });
    return {
      token, paper: { title: manifest.paper.title, subject: manifest.paper.subject, grade: manifest.paper.grade, alreadyImported: Boolean(existingPaper) },
      titleConflict: titleConflict?.title ?? null,
      questions: manifest.questions.map((question) => ({ id: question.id, subject: question.subject, contentPreview: question.content.slice(0, 220), imageCount: question.images.length, duplicate: existingQuestionIds.has(question.id) })),
      newCount: manifest.questions.filter((question) => !existingQuestionIds.has(question.id)).length,
      duplicateCount: existingQuestionIds.size,
    };
  }

  @Post('import')
  async import(@Req() request: Request, @Body() body: { token?: string }) {
    this.requireClassAdmin(request);
    if (!body?.token || !/^[a-f0-9-]{36}$/i.test(body.token)) throw new BadRequestException('导入预览已失效，请重新选择整卷包');
    const { accountId, classroomId } = (request as any).auth;
    const packagePath = join(this.stagingDirectory, `${accountId}-${body.token}.zip`);
    let uploadedAt: Date;
    try { uploadedAt = (await stat(packagePath)).mtime; } catch { throw new NotFoundException('导入预览已失效，请重新选择整卷包'); }
    if (Date.now() - uploadedAt.getTime() > this.stagingTtlMs) { await unlink(packagePath).catch(() => undefined); throw new NotFoundException('导入预览已过期，请重新选择整卷包'); }
    const { manifest, files } = this.parsePackage(await readFile(packagePath));
    const existingPaper = await this.prisma.paper.findFirst({ where: { classroomId, scope: 'CLASSROOM', originId: manifest.paper.id } });
    if (!existingPaper) {
      const sharedPapers = await this.prisma.paper.findMany({ where: { classroomId, scope: 'CLASSROOM' }, select: { id: true, title: true } });
      const titleConflict = sharedPapers.find((paper) => paper.title.trim().toLocaleLowerCase() === manifest.paper.title.trim().toLocaleLowerCase());
      if (titleConflict) throw new BadRequestException(`班级已有同名试卷「${titleConflict.title}」，请先调整班级试卷名称后重试`);
    }
    const paperId = existingPaper?.id ?? randomUUID();
    const existingQuestions = existingPaper ? await this.prisma.question.findMany({ where: { paperId, originId: { in: manifest.questions.map((question) => question.id) } }, select: { originId: true } }) : [];
    const existingIds = new Set(existingQuestions.map((question) => question.originId));
    const newQuestions = manifest.questions.filter((question) => !existingIds.has(question.id));
    for (const question of newQuestions) if (question.majorNumber != null && question.minorNumber != null) {
      const duplicateNumber = await this.prisma.question.findFirst({ where: { paperId, majorNumber: question.majorNumber, minorNumber: question.minorNumber }, select: { id: true } });
      if (duplicateNumber) throw new BadRequestException(`目标试卷的第 ${question.majorNumber} 大题第 ${question.minorNumber} 小题已被其他题目占用`);
    }
    const savedImageNames = new Map<string, string>();
    const createdFiles: string[] = [];
    try {
      for (const question of newQuestions) for (const image of question.images) {
        if (savedImageNames.has(image.fileName)) continue;
        const bytes = files.get(image.fileName);
        if (!bytes) throw new BadRequestException(`题目包缺少题图：${image.originalName}`);
        const name = await this.storage.save(bytes, image.originalName, ['.png', '.jpg', '.jpeg', '.webp']);
        savedImageNames.set(image.fileName, name); createdFiles.push(name);
      }
      await this.prisma.$transaction(async (tx) => {
        if (!existingPaper) await tx.paper.create({ data: {
          id: paperId, title: manifest.paper.title, subject: manifest.paper.subject, grade: manifest.paper.grade ?? null,
          scope: 'CLASSROOM', classroomId, ownerAccountId: null, originId: manifest.paper.id, createdById: accountId,
        } });
        for (const question of newQuestions) await tx.question.create({ data: {
          id: randomUUID(), originId: question.id, subject: question.subject, questionType: question.questionType ?? null, grade: question.grade ?? manifest.paper.grade ?? null,
          content: question.content, answer: question.answer ?? '', explanation: question.explanation ?? '', paperId,
          pageNumber: question.pageNumber ?? null, majorNumber: question.majorNumber ?? null, minorNumber: question.minorNumber ?? null, sourceTitle: manifest.paper.title, createdById: accountId,
          tags: { create: [...new Set(question.tags)].map((name) => ({ tag: { connectOrCreate: { where: { name }, create: { name } } } })) },
          images: { create: question.images.map((image) => ({ fileName: savedImageNames.get(image.fileName)!, originalName: image.originalName, rotation: image.rotation ?? 0, displayScale: image.displayScale ?? 1, position: image.position ?? 0 })) },
        } });
      });
    } catch (error) {
      await Promise.all(createdFiles.map((fileName) => this.storage.remove(fileName)));
      throw error;
    }
    await unlink(packagePath).catch(() => undefined);
    return { imported: newQuestions.length, skipped: manifest.questions.length - newQuestions.length, paperTitle: manifest.paper.title };
  }

  @Post('preview/:token/discard')
  async discardPreview(@Req() request: Request, @Param('token') token: string) {
    if (!/^[a-f0-9-]{36}$/i.test(token)) throw new BadRequestException('导入预览标识无效');
    const accountId = (request as any).auth.accountId as string;
    await unlink(join(this.stagingDirectory, `${accountId}-${token}.zip`)).catch(() => undefined);
    return { discarded: true };
  }

  private parsePackage(bytes: Buffer): { manifest: PaperPackage; files: Map<string, Buffer> } {
    let zip: AdmZip;
    try { zip = new AdmZip(bytes); } catch { throw new BadRequestException('整卷包无法读取'); }
    const entry = zip.getEntry('manifest.json');
    if (!entry) throw new BadRequestException('整卷包缺少 manifest.json');
    let manifest: PaperPackage;
    try { manifest = JSON.parse(entry.getData().toString('utf8')); } catch { throw new BadRequestException('整卷包清单格式无效'); }
    if (manifest?.format !== 'review-center-paper-package' || manifest.version !== 1 || !manifest.paper || !Array.isArray(manifest.questions)) throw new BadRequestException('不支持此整卷包格式');
    if (typeof manifest.paper.id !== 'string' || !manifest.paper.id || typeof manifest.paper.title !== 'string' || !manifest.paper.title.trim() || typeof manifest.paper.subject !== 'string' || !manifest.paper.subject.trim()) throw new BadRequestException('试卷信息无效');
    const files = new Map<string, Buffer>();
    for (const item of zip.getEntries()) {
      if (item.isDirectory || !item.entryName.startsWith('images/')) continue;
      const name = item.entryName.slice('images/'.length);
      if (!name || basename(name) !== name || !/^[a-zA-Z0-9._-]+$/.test(name)) throw new BadRequestException('整卷包包含无效题图文件名');
      files.set(name, item.getData());
    }
    const ids = new Set<string>();
    const numbers = new Set<string>();
    for (const question of manifest.questions) {
      if (!question || typeof question.id !== 'string' || !question.id || ids.has(question.id) || typeof question.subject !== 'string' || !question.subject.trim() || typeof question.content !== 'string' || !Array.isArray(question.tags) || !Array.isArray(question.images)) throw new BadRequestException('整卷包中的题目数据无效');
      ids.add(question.id);
      for (const value of [question.majorNumber, question.minorNumber]) if (value != null && (!Number.isInteger(value) || value < 1)) throw new BadRequestException('大题号或小题号无效');
      if (question.majorNumber != null && question.minorNumber != null) {
        const key = `${question.majorNumber}:${question.minorNumber}`;
        if (numbers.has(key)) throw new BadRequestException(`整卷包中第 ${question.majorNumber} 大题第 ${question.minorNumber} 小题重复`);
        numbers.add(key);
      }
      for (const image of question.images) {
        const data = files.get(image.fileName);
        if (!data || typeof image.originalName !== 'string') throw new BadRequestException(`整卷包缺少题图：${image.originalName ?? ''}`);
        this.validateImage(data, image.originalName);
      }
    }
    return { manifest, files };
  }

  private validateImage(buffer: Buffer, originalName: string) {
    const extension = originalName.toLowerCase().slice(originalName.lastIndexOf('.'));
    const valid = extension === '.png' && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || ['.jpg', '.jpeg'].includes(extension) && buffer[0] === 0xff && buffer[1] === 0xd8
      || extension === '.webp' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new BadRequestException(`题图文件内容无效：${originalName}`);
  }

  private requireClassAdmin(request: Request) {
    if (!(request as any).auth.isClassAdmin) throw new ForbiddenException('只有班级管理员可以导入共享试卷');
  }

  private async removeExpiredPackages() {
    for (const name of await readdir(this.stagingDirectory)) {
      if (!name.endsWith('.zip')) continue;
      const path = join(this.stagingDirectory, name);
      const info = await stat(path).catch(() => null);
      if (info && Date.now() - info.mtime.getTime() > this.stagingTtlMs) await unlink(path).catch(() => undefined);
    }
  }
}
