import {
  BadRequestException, Controller, Get, Post, Req, Res, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SessionGuard } from './session.guard';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

type UploadFile = { buffer: Buffer };

@Controller('backup')
@UseGuards(SessionGuard)
export class BackupController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  @Get()
  async export(@Req() request: Request, @Res() response: Response) {
    const { accountId, classroomId } = (request as any).auth;
    const visiblePapers = { OR: [{ scope: 'CLASSROOM', classroomId }, { scope: 'PERSONAL', ownerAccountId: accountId }] };
    const [papers, students] = await Promise.all([
      this.prisma.paper.findMany({ where: visiblePapers }),
      this.prisma.student.findMany({ where: { accountId }, take: 1 }),
    ]);
    const studentIds = students.map((student) => student.id);
    const questions = await this.prisma.question.findMany({ where: { paper: visiblePapers }, include: {
      tags: { include: { tag: true } }, images: true,
      attempts: { where: { studentId: { in: studentIds } } }, mastery: { where: { studentId: { in: studentIds } } }, students: { where: { studentId: { in: studentIds } } },
    } });
    const manifest = {
      format: 'review-center-backup', version: 1, exportedAt: new Date().toISOString(),
      papers: papers.map((paper) => ({ ...paper, originalName: null, fileName: null })),
      students,
      questions: questions.map((question) => ({
        ...question,
        tags: question.tags.map((item) => item.tag.name),
      })),
    };
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    const names = new Set<string>();
    for (const question of questions) for (const image of question.images) names.add(image.fileName);
    for (const name of names) {
      const data = await readFile(this.storage.path(name));
      zip.addFile(`uploads/${name}`, data);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="review-center-backup-${stamp}.zip"`);
    response.send(zip.toBuffer());
  }

  @Post('restore')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 250 * 1024 * 1024 } }))
  async restore() {
    throw new BadRequestException('不支持整库覆盖恢复，请通过整卷包导入班级共享试卷。');
  }
}
