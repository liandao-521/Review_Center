import { Controller, Get, NotFoundException, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { SessionGuard } from './session.guard';
import { StorageService } from './storage.service';
import { PrismaService } from './prisma.service';

@Controller('files')
@UseGuards(SessionGuard)
export class FilesController {
  constructor(private readonly storage: StorageService, private readonly prisma: PrismaService) {}

  @Get(':fileName')
  async get(@Req() request: Request, @Param('fileName') fileName: string, @Res() res: Response) {
    const auth = (request as any).auth;
    const image = await this.prisma.questionImage.findFirst({ where: { fileName, question: { paper: { OR: [
      { scope: 'CLASSROOM', classroomId: auth.classroomId },
      { scope: 'PERSONAL', ownerAccountId: auth.accountId },
    ] } } }, select: { id: true } });
    if (!image) throw new NotFoundException('找不到文件');
    try {
      const path = this.storage.path(fileName);
      const bytes = await readFile(path);
      return res.type(extname(path)).send(bytes);
    } catch {
      throw new NotFoundException('找不到文件');
    }
  }
}
