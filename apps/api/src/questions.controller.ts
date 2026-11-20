import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException,
  Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { SessionGuard } from './session.guard';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

type UploadFile = { buffer: Buffer; originalname: string; mimetype: string };

@Controller('questions')
@UseGuards(SessionGuard)
export class QuestionsController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  @Get()
  async list(@Req() request: Request, @Query() query: Record<string, string>) {
    const auth = (request as any).auth;
    const scope = query.scope || 'CLASSROOM';
    if (!['PERSONAL', 'CLASSROOM', 'ALL'].includes(scope)) throw new BadRequestException('题库范围无效');
    const questions = await this.prisma.question.findMany({
      where: {
        paper: this.visiblePapersWhere(auth, scope),
        subject: query.subject || undefined,
        questionType: query.questionType || undefined,
        paperId: query.paperId || undefined,
        OR: query.q ? [
          { content: { contains: query.q } },
          { answer: { contains: query.q } },
          { explanation: { contains: query.q } },
        ] : undefined,
        tags: query.tag ? { some: { tag: { name: query.tag } } } : undefined,
      },
      include: {
        tags: { include: { tag: true } },
        images: { orderBy: { position: 'asc' } },
        paper: true,
        attempts: { where: { studentId: auth.studentId }, orderBy: { createdAt: 'desc' } },
        mastery: { where: { studentId: auth.studentId } },
        students: { where: { studentId: auth.studentId } },
        editors: { include: { account: { select: { id: true, displayName: true, username: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const wrongCount = (question: (typeof questions)[number]) => question.attempts.filter((attempt) => !attempt.isCorrect).length;
    const selected = questions.filter((question) => {
      if (query.grade && question.grade !== query.grade) return false;
      const score = question.mastery[0]?.score ?? null;
      if (query.masteryScore === 'unrated' && score !== null) return false;
      if (query.masteryScore && query.masteryScore !== 'unrated' && score !== Number(query.masteryScore)) return false;
      if (query.wrongCount !== undefined && query.wrongCount !== '' && query.wrongCount !== 'any') {
        const count = wrongCount(question);
        const target = Number(query.wrongCount);
        if (!Number.isFinite(target)) return false;
        if ((query.wrongMode ?? 'exact') === 'atLeast' ? count < target : count !== target) return false;
      }
      return true;
    });
    if (query.masteryScore && query.masteryScore !== 'unrated') selected.sort((a, b) => (b.mastery[0]?.updatedAt.getTime() ?? 0) - (a.mastery[0]?.updatedAt.getTime() ?? 0));
    const isClassAdmin = Boolean(auth.isClassAdmin);
    return selected.map((question) => {
      const personalOwner = question.paper.scope === 'PERSONAL' && question.paper.ownerAccountId === auth.accountId;
      const assigned = question.editors.some((item) => item.accountId === auth.accountId);
      const canEdit = personalOwner || (question.paper.scope === 'CLASSROOM' && (isClassAdmin || assigned));
      const canDelete = personalOwner || (question.paper.scope === 'CLASSROOM' && isClassAdmin);
      return { ...question, canManage: canEdit, canEdit, canDelete, canAssign: question.paper.scope === 'CLASSROOM' && isClassAdmin, editorNames: question.editors.map((item) => item.account.displayName), inWrongSet: question.students.length > 0, students: undefined, editors: undefined, masteryScore: question.mastery[0]?.score ?? null, masteryUpdatedAt: question.mastery[0]?.updatedAt ?? null, wrongCount: wrongCount(question), tags: question.tags.map((item) => item.tag.name) };
    });
  }

  @Get('tags')
  async tags(@Req() request: Request, @Query('scope') scope = 'ALL') {
    const auth = (request as any).auth;
    if (!['PERSONAL', 'CLASSROOM', 'ALL'].includes(scope)) throw new BadRequestException('题库范围无效');
    const paperWhere = this.visiblePapersWhere(auth, scope);
    const tags = await this.prisma.tag.findMany({ where: { questions: { some: { question: { paper: paperWhere } } } }, orderBy: { name: 'asc' }, include: { _count: { select: { questions: { where: { question: { paper: paperWhere } } } } } } });
    return tags.map((tag) => ({ name: tag.name, count: tag._count.questions }));
  }

  @Get('editors')
  async editorCandidates(@Req() request: Request, @Query('questionId') questionId: string) {
    this.requireClassAdmin(request);
    const classroomId = (request as any).auth.classroomId as string;
    const question = await this.prisma.question.findFirst({ where: { id: questionId, paper: { scope: 'CLASSROOM', classroomId } }, include: { editors: { select: { accountId: true } } } });
    if (!question) throw new NotFoundException('找不到这道题');
    const accounts = await this.prisma.account.findMany({ where: { classroomId }, orderBy: { displayName: 'asc' }, select: { id: true, username: true, displayName: true, isClassAdmin: true, active: true } });
    return { editors: question.editors.map((item) => item.accountId), members: accounts };
  }

  @Put(':id/editors')
  async assignEditors(@Req() request: Request, @Param('id') id: string, @Body() body: { accountIds?: unknown }) {
    this.requireClassAdmin(request);
    const classroomId = (request as any).auth.classroomId as string;
    if (!Array.isArray(body?.accountIds) || body.accountIds.some((value) => typeof value !== 'string' || !value.trim())) throw new BadRequestException('编辑成员列表无效');
    const accountIds = [...new Set(body.accountIds as string[])];
    const question = await this.prisma.question.findFirst({ where: { id, paper: { scope: 'CLASSROOM', classroomId } }, select: { id: true } });
    if (!question) throw new NotFoundException('找不到这道题');
    const members = await this.prisma.account.findMany({ where: { id: { in: accountIds }, classroomId }, select: { id: true } });
    if (members.length !== accountIds.length) throw new BadRequestException('只能分配给本班的学生账号');
    await this.prisma.$transaction(async (tx) => {
      await tx.questionEditorAssignment.deleteMany({ where: { questionId: id } });
      if (accountIds.length) await tx.questionEditorAssignment.createMany({ data: accountIds.map((accountId) => ({ questionId: id, accountId })) });
    });
    return { editors: accountIds };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: any) {
    const auth = (request as any).auth;
    const paper = await this.validateQuestion(body, auth);
    this.requireCanCreateQuestion(auth, paper);
    await this.ensureUniquePaperNumber(paper.id, body);
    const names = this.cleanTags(body.tags);
    const question = await this.prisma.question.create({
      data: {
        subject: body.subject.trim(), questionType: body.questionType?.trim() || null, grade: body.grade?.trim() || null,
        content: body.content?.trim() ?? '', answer: body.answer ?? '', explanation: body.explanation ?? '',
        paperId: paper.id, pageNumber: body.pageNumber ? Number(body.pageNumber) : null,
        majorNumber: this.optionalPositiveInteger(body.majorNumber), minorNumber: this.optionalPositiveInteger(body.minorNumber),
        sourceTitle: paper.title, createdById: auth.accountId,
        tags: { create: await this.tagLinks(names) },
      },
      include: { tags: { include: { tag: true } }, images: true, paper: true, attempts: true },
    });
    return { ...question, canManage: true, canEdit: true, canDelete: paper.scope === 'PERSONAL' ? paper.ownerAccountId === auth.accountId : Boolean(auth.isClassAdmin), canAssign: paper.scope === 'CLASSROOM' && Boolean(auth.isClassAdmin), tags: question.tags.map((item) => item.tag.name), wrongCount: 0 };
  }

  @Patch(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: any) {
    const auth = (request as any).auth;
    const paper = await this.validateQuestion(body, auth);
    const existing = await this.prisma.question.findFirst({ where: { id, paper: this.visiblePapersWhere(auth, 'ALL') }, include: { paper: true } });
    if (!existing) throw new NotFoundException('找不到这道题');
    if (!await this.canEditQuestion(auth, id)) throw new ForbiddenException('没有这道题的编辑权限');
    if (existing.paper.scope !== paper.scope || (paper.scope === 'PERSONAL' && paper.ownerAccountId !== auth.accountId) || (paper.scope === 'CLASSROOM' && paper.classroomId !== auth.classroomId)) throw new BadRequestException('题目只能移动到同一范围内的试卷');
    await this.ensureUniquePaperNumber(paper.id, body, id);
    const names = this.cleanTags(body.tags);
    await this.prisma.questionTag.deleteMany({ where: { questionId: id } });
    const question = await this.prisma.question.update({
      where: { id },
      data: {
        subject: body.subject.trim(), questionType: body.questionType?.trim() || null, grade: body.grade?.trim() || null,
        content: body.content?.trim() ?? '', answer: body.answer ?? '', explanation: body.explanation ?? '',
        paperId: paper.id, pageNumber: body.pageNumber ? Number(body.pageNumber) : null,
        majorNumber: this.optionalPositiveInteger(body.majorNumber), minorNumber: this.optionalPositiveInteger(body.minorNumber),
        sourceTitle: paper.title,
        tags: { create: await this.tagLinks(names) },
      },
      include: { tags: { include: { tag: true } }, images: { orderBy: { position: 'asc' } }, paper: true, attempts: true },
    });
    return { ...question, canManage: true, canEdit: true, tags: question.tags.map((item) => item.tag.name), wrongCount: question.attempts.filter((attempt) => !attempt.isCorrect).length };
  }

  @Delete(':id')
  async remove(@Req() request: Request, @Param('id') id: string) {
    const auth = (request as any).auth;
    const question = await this.prisma.question.findFirst({ where: { id, paper: this.visiblePapersWhere(auth, 'ALL') }, include: { paper: true, images: true } });
    if (!question) throw new NotFoundException('找不到这道题');
    if (!await this.canDeleteQuestion(auth, question)) throw new ForbiddenException('没有这道题的删除权限');
    await this.prisma.question.delete({ where: { id } });
    await Promise.all(question.images.map((image) => this.storage.remove(image.fileName)));
    return { deleted: true };
  }

  @Delete()
  async removeMany(@Req() request: Request, @Body() body: { ids?: unknown }) {
    const auth = (request as any).auth;
    if (!body || !Array.isArray(body.ids) || body.ids.length === 0 || body.ids.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new BadRequestException('请提供要删除的题目 ID');
    }
    const ids = [...new Set(body.ids as string[])];
    const questions = await this.prisma.question.findMany({
      where: { id: { in: ids }, paper: this.visiblePapersWhere(auth, 'ALL') },
      include: { paper: true, images: { select: { fileName: true } } },
    });
    const canDeleteIds = (await Promise.all(questions.map(async (question) => await this.canDeleteQuestion(auth, question) ? question.id : null))).filter((id): id is string => Boolean(id));
    const result = await this.prisma.question.deleteMany({ where: { id: { in: canDeleteIds } } });
    await Promise.all(questions.flatMap((question) => question.images.map((image) => this.storage.remove(image.fileName))));
    return { deleted: result.count };
  }

  @Post(':id/attempts')
  async attempt(@Req() request: Request, @Param('id') id: string, @Body() body: { isCorrect?: boolean; note?: string }) {
    const auth = (request as any).auth;
    const question = await this.prisma.question.findFirst({ where: { id, paper: this.visiblePapersWhere(auth, 'ALL') }, select: { id: true } });
    if (!question) throw new NotFoundException('找不到这道题');
    if (typeof body.isCorrect !== 'boolean') throw new BadRequestException('请记录本次练习结果');
    const studentId = auth.studentId as string;
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.practiceAttempt.create({ data: { questionId: id, studentId, isCorrect: body.isCorrect!, note: body.note ?? '' } });
      if (!body.isCorrect) await tx.studentQuestion.upsert({
        where: { studentId_questionId: { studentId, questionId: id } },
        create: { studentId, questionId: id }, update: {},
      });
      return attempt;
    });
  }

  @Put(':id/wrong-set')
  async addToWrongSet(@Req() request: Request, @Param('id') id: string) {
    const { studentId, ...auth } = (request as any).auth;
    if (!await this.prisma.question.findFirst({ where: { id, paper: this.visiblePapersWhere(auth, 'ALL') }, select: { id: true } })) throw new NotFoundException('找不到这道题');
    return this.prisma.studentQuestion.upsert({
      where: { studentId_questionId: { studentId, questionId: id } },
      create: { studentId, questionId: id }, update: {},
    });
  }

  @Delete(':id/wrong-set')
  async removeFromWrongSet(@Req() request: Request, @Param('id') id: string) {
    const { studentId, ...auth } = (request as any).auth;
    if (!await this.prisma.question.findFirst({ where: { id, paper: this.visiblePapersWhere(auth, 'ALL') }, select: { id: true } })) throw new NotFoundException('找不到这道题');
    await this.prisma.studentQuestion.deleteMany({ where: { studentId, questionId: id } });
    return { removed: true };
  }

  @Put(':id/mastery')
  async setMastery(@Req() request: Request, @Param('id') id: string, @Body() body: { score?: number }) {
    const { studentId, ...auth } = (request as any).auth;
    if (!await this.prisma.question.findFirst({ where: { id, paper: this.visiblePapersWhere(auth, 'ALL') }, select: { id: true } })) throw new NotFoundException('找不到这道题');
    if (!Number.isInteger(body.score) || body.score! < 1 || body.score! > 5) throw new BadRequestException('掌握程度必须是 1 到 5 分');
    return this.prisma.questionMastery.upsert({
      where: { studentId_questionId: { studentId, questionId: id } },
      create: { studentId, questionId: id, score: body.score! },
      update: { score: body.score! },
    });
  }

  @Delete(':id/mastery')
  async clearMastery(@Req() request: Request, @Param('id') id: string) {
    const { studentId, ...auth } = (request as any).auth;
    if (!await this.prisma.question.findFirst({ where: { id, paper: this.visiblePapersWhere(auth, 'ALL') }, select: { id: true } })) throw new NotFoundException('找不到这道题');
    await this.prisma.questionMastery.deleteMany({ where: { questionId: id, studentId } });
    return { cleared: true };
  }

  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  async addImage(@Req() request: Request, @Param('id') id: string, @UploadedFile() file?: UploadFile) {
    if (!file) throw new BadRequestException('请选择图片');
    const auth = (request as any).auth;
    const question = await this.prisma.question.findFirst({ where: { id, paper: this.visiblePapersWhere(auth, 'ALL') }, select: { id: true, paper: true } });
    if (!question) throw new NotFoundException('找不到这道题');
    if (!await this.canEditQuestion(auth, id)) throw new ForbiddenException('没有这道题的编辑权限');
    this.validateImage(file);
    const fileName = await this.storage.save(file.buffer, file.originalname, ['.png', '.jpg', '.jpeg', '.webp']);
    const lastImage = await this.prisma.questionImage.findFirst({ where: { questionId: id }, orderBy: { position: 'desc' }, select: { position: true } });
    return this.prisma.questionImage.create({ data: { questionId: id, fileName, originalName: file.originalname, position: (lastImage?.position ?? -1) + 1 } });
  }

  @Post('images/:imageId/replace')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  async replaceImage(@Req() request: Request, @Param('imageId') imageId: string, @UploadedFile() file?: UploadFile) {
    if (!file) throw new BadRequestException('请选择替换图片');
    const auth = (request as any).auth;
    const image = await this.prisma.questionImage.findFirst({ where: { id: imageId, question: { paper: this.visiblePapersWhere(auth, 'ALL') } } });
    if (!image) throw new NotFoundException('找不到这张图片');
    if (!await this.canEditQuestion(auth, image.questionId)) throw new ForbiddenException('没有这道题的编辑权限');
    this.validateImage(file);
    const newFileName = await this.storage.save(file.buffer, file.originalname, ['.png', '.jpg', '.jpeg', '.webp']);
    const updated = await this.prisma.questionImage.update({ where: { id: imageId }, data: { fileName: newFileName, originalName: file.originalname, rotation: 0, displayScale: 1 } });
    await this.storage.remove(image.fileName);
    return updated;
  }

  @Patch('images/:imageId')
  async editImage(@Req() request: Request, @Param('imageId') imageId: string, @Body() body: { rotation?: number; displayScale?: number }) {
    const auth = (request as any).auth;
    const image = await this.prisma.questionImage.findFirst({ where: { id: imageId, question: { paper: this.visiblePapersWhere(auth, 'ALL') } } });
    if (!image) throw new NotFoundException('找不到这张图片');
    if (!await this.canEditQuestion(auth, image.questionId)) throw new ForbiddenException('没有这道题的编辑权限');
    const rotation = body.rotation === undefined ? image.rotation : ((Math.round(body.rotation / 90) * 90 % 360) + 360) % 360;
    const displayScale = body.displayScale === undefined ? image.displayScale : Math.min(1.5, Math.max(0.5, Number(body.displayScale)));
    return this.prisma.questionImage.update({ where: { id: imageId }, data: { rotation, displayScale } });
  }

  @Delete('images/:imageId')
  async removeImage(@Req() request: Request, @Param('imageId') imageId: string) {
    const auth = (request as any).auth;
    const image = await this.prisma.questionImage.findFirst({ where: { id: imageId, question: { paper: this.visiblePapersWhere(auth, 'ALL') } } });
    if (!image) throw new NotFoundException('找不到这张图片');
    if (!await this.canEditQuestion(auth, image.questionId)) throw new ForbiddenException('没有这道题的编辑权限');
    await this.prisma.questionImage.delete({ where: { id: imageId } });
    await this.storage.remove(image.fileName);
    return { deleted: true };
  }

  private async validateQuestion(body: any, auth: any) {
    if (!body || typeof body.subject !== 'string' || !body.subject.trim()) throw new BadRequestException('请选择科目');
    if (typeof body.paperId !== 'string' || !body.paperId.trim()) throw new BadRequestException('请选择试卷来源');
    const paper = await this.prisma.paper.findFirst({ where: { id: body.paperId, OR: [
      { scope: 'CLASSROOM', classroomId: auth.classroomId },
      { scope: 'PERSONAL', ownerAccountId: auth.accountId },
    ] }, select: { id: true, title: true, scope: true, ownerAccountId: true, classroomId: true } });
    if (!paper) throw new BadRequestException('请选择有效的试卷来源');
    if (typeof body.content !== 'string') body.content = '';
    if (!body.content.trim() && !body.allowImageOnly && !body.allowBlank) throw new BadRequestException('请填写题目内容或添加题图');
    if (body.pageNumber && !Number.isInteger(Number(body.pageNumber))) throw new BadRequestException('页码格式不正确');
    for (const key of ['majorNumber', 'minorNumber']) {
      const value = body[key];
      if (value !== undefined && value !== null && value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 1)) throw new BadRequestException('大题号和小题号必须是正整数');
    }
    return paper;
  }

  private optionalPositiveInteger(value: unknown): number | null {
    return value === undefined || value === null || value === '' ? null : Number(value);
  }

  private async ensureUniquePaperNumber(paperId: string, body: any, exceptId?: string) {
    const majorNumber = this.optionalPositiveInteger(body.majorNumber);
    const minorNumber = this.optionalPositiveInteger(body.minorNumber);
    if (majorNumber === null || minorNumber === null) return;
    const duplicate = await this.prisma.question.findFirst({ where: {
      paperId, majorNumber, minorNumber,
      id: exceptId ? { not: exceptId } : undefined,
    }, select: { id: true } });
    if (duplicate) throw new ConflictException(`这份试卷的第 ${majorNumber} 大题第 ${minorNumber} 小题已经录入`);
  }

  private cleanTags(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.map((value) => String(value).trim()).filter(Boolean))].slice(0, 20);
  }

  private requireCanCreateQuestion(auth: any, paper: { scope: string; ownerAccountId: string | null }) {
    if (paper.scope === 'CLASSROOM' && !auth.isClassAdmin) throw new ForbiddenException('只有班级管理员可以创建班级共享题目');
    if (paper.scope === 'PERSONAL' && paper.ownerAccountId !== auth.accountId) throw new ForbiddenException('不能在其他学生的个人试卷中创建题目');
  }

  private requireClassAdmin(request: Request) {
    if (!(request as any).auth.isClassAdmin) throw new ForbiddenException('只有班级管理员可以管理共享题目编辑权限');
  }

  private visiblePapersWhere(auth: any, scope: string) {
    const personal = { scope: 'PERSONAL', ownerAccountId: auth.accountId };
    const classroom = { scope: 'CLASSROOM', classroomId: auth.classroomId };
    if (scope === 'PERSONAL') return personal;
    if (scope === 'CLASSROOM') return classroom;
    return { OR: [personal, classroom] };
  }

  private async canEditQuestion(auth: any, questionId: string) {
    const question = await this.prisma.question.findFirst({
      where: { id: questionId, paper: this.visiblePapersWhere(auth, 'ALL') },
      select: { paper: { select: { scope: true, ownerAccountId: true } }, editors: { where: { accountId: auth.accountId }, select: { accountId: true } } },
    });
    return Boolean(question && (question.paper.scope === 'PERSONAL' ? question.paper.ownerAccountId === auth.accountId : auth.isClassAdmin || question.editors.length));
  }

  private async canDeleteQuestion(auth: any, question: { paper?: { scope: string; ownerAccountId?: string | null } }) {
    if (!question.paper) return false;
    return question.paper.scope === 'PERSONAL' ? question.paper.ownerAccountId === auth.accountId : Boolean(auth.isClassAdmin);
  }

  private async tagLinks(names: string[]) {
    const tags = await Promise.all(names.map((name) => this.prisma.tag.upsert({ where: { name }, create: { name }, update: {} })));
    return tags.map((tag) => ({ tagId: tag.id }));
  }

  private validateImage(file: UploadFile) {
    const allowedMime = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMime.includes(file.mimetype)) throw new BadRequestException('图片仅支持 PNG、JPG 或 WebP');
    const isPng = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
    const isWebp = file.buffer.toString('ascii', 0, 4) === 'RIFF' && file.buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!(isPng || isJpeg || isWebp)) throw new BadRequestException('图片文件内容格式无效');
  }
}
