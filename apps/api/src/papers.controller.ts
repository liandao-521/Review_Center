import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException,
  Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionGuard } from './session.guard';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

type PaperScope = 'PERSONAL' | 'CLASSROOM';

@Controller('papers')
@UseGuards(SessionGuard)
export class PapersController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  @Get()
  async list(@Req() request: Request, @Query('scope') scopeValue?: string) {
    const auth = (request as any).auth;
    const scope = this.parseScope(scopeValue);
    const where = scope === 'PERSONAL' ? { scope, ownerAccountId: auth.accountId } : { scope, classroomId: auth.classroomId };
    const papers = await this.prisma.paper.findMany({ where, orderBy: { createdAt: 'desc' }, include: { _count: { select: { questions: true } } } });
    return papers.map(({ _count, ...paper }) => ({ ...paper, canManage: this.canManagePaper(auth, paper), questionCount: _count.questions }));
  }

  @Post()
  async create(@Req() request: Request, @Body() body: { title?: string; subject?: string; grade?: string; scope?: string }) {
    const auth = (request as any).auth;
    const scope = this.parseScope(body?.scope);
    const data = this.cleanMetadata(body);
    this.requireCanManageScope(auth, scope);
    await this.ensureUniqueTitle(scope, auth.accountId, auth.classroomId, data.title);
    return { ...await this.prisma.paper.create({ data: {
      ...data, scope,
      classroomId: auth.classroomId,
      ownerAccountId: scope === 'PERSONAL' ? auth.accountId : null,
      createdById: auth.accountId, originalName: null, fileName: null,
    } }), canManage: true, questionCount: 0 };
  }

  @Patch(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: { title?: string; subject?: string; grade?: string }) {
    const auth = (request as any).auth;
    const paper = await this.findAccessiblePaper(auth, id);
    if (!this.canManagePaper(auth, paper)) throw new ForbiddenException('沒有這份試卷的管理權限');
    const data = this.cleanMetadata(body, paper);
    await this.ensureUniqueTitle(paper.scope as PaperScope, auth.accountId, auth.classroomId, data.title, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.paper.update({ where: { id }, data });
      if (data.title !== paper.title) await tx.question.updateMany({ where: { paperId: id }, data: { sourceTitle: data.title } });
      return result;
    });
    return { ...updated, canManage: true };
  }

  @Delete(':id')
  async remove(@Req() request: Request, @Param('id') id: string) {
    const auth = (request as any).auth;
    const paper = await this.findAccessiblePaper(auth, id, true);
    if (!this.canManagePaper(auth, paper)) throw new ForbiddenException('沒有這份试卷的管理权限');
    if (paper._count.questions > 0 && paper.scope === 'CLASSROOM') throw new ConflictException('这份试卷仍关联题目，不能删除班级共享试卷');
    const images = paper.scope === 'PERSONAL' ? await this.prisma.questionImage.findMany({ where: { question: { paperId: id } }, select: { fileName: true } }) : [];
    await this.prisma.$transaction(async (tx) => {
      if (paper.scope === 'PERSONAL') await tx.question.deleteMany({ where: { paperId: id } });
      await tx.paper.delete({ where: { id } });
    });
    await Promise.all(images.map((image) => this.storage.remove(image.fileName)));
    return { deleted: true };
  }

  private parseScope(value?: string): PaperScope {
    const scope = value?.toUpperCase() || 'CLASSROOM';
    if (scope !== 'PERSONAL' && scope !== 'CLASSROOM') throw new BadRequestException('题库范围无效');
    return scope;
  }

  private cleanMetadata(body: { title?: string; subject?: string; grade?: string }, existing?: { title: string; subject: string; grade: string | null }) {
    const title = body?.title?.trim() || existing?.title;
    const subject = body?.subject?.trim() || existing?.subject;
    if (!title) throw new BadRequestException('请填写试卷名称');
    if (!subject) throw new BadRequestException('请选择科目');
    return { title, subject, grade: body.grade === undefined ? (existing?.grade ?? null) : body.grade.trim() || null };
  }

  private async ensureUniqueTitle(scope: PaperScope, accountId: string, classroomId: string, title: string, exceptId?: string) {
    const where = scope === 'PERSONAL' ? { scope, ownerAccountId: accountId } : { scope, classroomId };
    const papers = await this.prisma.paper.findMany({ where, select: { id: true, title: true } });
    const duplicate = papers.find((paper) => paper.id !== exceptId && paper.title.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase());
    if (duplicate) throw new ConflictException(`已存在同名试卷「${duplicate.title}」，请选择已有试卷`);
  }

  private async findAccessiblePaper(auth: any, id: string, withCount = false) {
    const paper = await this.prisma.paper.findFirst({ where: { id, OR: [
      { scope: 'CLASSROOM', classroomId: auth.classroomId },
      { scope: 'PERSONAL', ownerAccountId: auth.accountId },
    ] }, ...(withCount ? { include: { _count: { select: { questions: true } } } } : {}) });
    if (!paper) throw new NotFoundException('找不到这份试卷');
    return paper as any;
  }

  private canManagePaper(auth: any, paper: { scope: string; ownerAccountId?: string | null }) {
    return paper.scope === 'PERSONAL' ? paper.ownerAccountId === auth.accountId : Boolean(auth.isClassAdmin);
  }

  private requireCanManageScope(auth: any, scope: PaperScope) {
    if (scope === 'CLASSROOM' && !auth.isClassAdmin) throw new ForbiddenException('只有班级管理员可以维护班级共享试卷');
  }
}
