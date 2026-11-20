import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminGuard } from './admin.guard';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  @Get('classes')
  async classes() {
    return this.prisma.classroom.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { accounts: true, papers: { where: { scope: 'CLASSROOM' } } } } } });
  }

  @Post('classes')
  async createClass(@Body() body: { name?: string }) {
    const name = body?.name?.trim();
    if (!name) throw new BadRequestException('请填写班级名称');
    const duplicate = await this.prisma.classroom.findFirst({ where: { name: { equals: name } } });
    if (duplicate) throw new ConflictException('班级名称已存在');
    return this.prisma.classroom.create({ data: { name } });
  }

  @Patch('classes/:id')
  async renameClass(@Param('id') id: string, @Body() body: { name?: string }) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id } });
    if (!classroom) throw new NotFoundException('找不到这个班级');
    const name = body?.name?.trim();
    if (!name) throw new BadRequestException('请填写班级名称');
    const duplicate = await this.prisma.classroom.findFirst({ where: { name: { equals: name }, id: { not: id } } });
    if (duplicate) throw new ConflictException('班级名称已存在');
    return this.prisma.classroom.update({ where: { id }, data: { name } });
  }

  @Delete('classes/:id')
  async deleteClass(@Param('id') id: string) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id }, include: { _count: { select: { accounts: true, papers: true } } } });
    if (!classroom) throw new NotFoundException('找不到这个班级');
    if (classroom._count.accounts || classroom._count.papers) throw new ConflictException('班级仍有关联学生或共享试卷，不能删除');
    await this.prisma.classroom.delete({ where: { id } });
    return { deleted: true };
  }

  @Get('accounts')
  async accounts() {
    return this.prisma.account.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, username: true, displayName: true, expiresAt: true, active: true, isClassAdmin: true, classroomId: true, createdAt: true, classroom: true } });
  }

  @Post('accounts')
  async createAccount(@Body() body: { username?: string; displayName?: string; password?: string; classroomId?: string; expiresAt?: string | null }) {
    const username = this.cleanUsername(body?.username);
    const displayName = body?.displayName?.trim();
    const password = body?.password;
    if (!displayName) throw new BadRequestException('请填写学生姓名');
    this.validatePassword(password);
    const classroom = await this.validClassroom(body.classroomId);
    const expiresAt = this.parseExpiry(body.expiresAt);
    if (!expiresAt) throw new BadRequestException('请设置账号到期日期');
    if (await this.prisma.account.findUnique({ where: { username } })) throw new ConflictException('登录账号已存在');
    const account = await this.prisma.account.create({ data: { username, displayName, passwordHash: await bcrypt.hash(password!, 12), classroomId: classroom.id, expiresAt, student: { create: { name: displayName } } }, select: { id: true, username: true, displayName: true, expiresAt: true, active: true, classroomId: true, classroom: true } });
    return account;
  }

  @Delete('accounts/:id')
  async deleteAccount(@Param('id') id: string) {
    return this.deleteStudentAccounts([id]);
  }

  @Delete('accounts')
  async deleteAccounts(@Body() body: { ids?: unknown }) {
    if (!Array.isArray(body?.ids) || !body.ids.length || body.ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(body.ids).size !== body.ids.length) {
      throw new BadRequestException('请提供不重复的学生账号 ID 列表');
    }
    return this.deleteStudentAccounts(body.ids as string[]);
  }

  @Patch('accounts/:id')
  async updateAccount(@Param('id') id: string, @Body() body: { displayName?: string; password?: string; classroomId?: string; expiresAt?: string | null; active?: boolean; isClassAdmin?: boolean }) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('找不到这个学生账号');
    const data: { displayName?: string; passwordHash?: string; classroomId?: string; expiresAt?: Date | null; active?: boolean; isClassAdmin?: boolean } = {};
    if (body.displayName !== undefined) {
      const displayName = body.displayName.trim();
      if (!displayName) throw new BadRequestException('学生姓名不能为空');
      data.displayName = displayName;
    }
    if (body.password !== undefined) { this.validatePassword(body.password); data.passwordHash = await bcrypt.hash(body.password, 12); }
    if (body.classroomId !== undefined) data.classroomId = (await this.validClassroom(body.classroomId)).id;
    if (body.expiresAt !== undefined) {
      data.expiresAt = this.parseExpiry(body.expiresAt);
      if (!data.expiresAt) throw new BadRequestException('请设置账号到期日期');
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.isClassAdmin !== undefined) data.isClassAdmin = Boolean(body.isClassAdmin);
    const targetClassroomId = data.classroomId ?? account.classroomId;
    const changedClassroom = targetClassroomId !== account.classroomId;
    if (changedClassroom) data.isClassAdmin = false;
    const targetIsClassAdmin = data.isClassAdmin ?? account.isClassAdmin;
    if (targetIsClassAdmin && (!account.isClassAdmin || changedClassroom)) {
      const count = await this.prisma.account.count({ where: { classroomId: targetClassroomId, isClassAdmin: true } });
      if (count >= 3) throw new ConflictException('每个班级最多设置 3 位班级管理员');
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.account.update({ where: { id }, data, include: { classroom: true } });
      if (body.displayName !== undefined) await transaction.student.updateMany({ where: { accountId: id }, data: { name: data.displayName } });
      if (changedClassroom) {
        await transaction.studentQuestion.deleteMany({
          where: {
            student: { accountId: id },
            question: { paper: { scope: 'CLASSROOM', classroomId: account.classroomId } },
          },
        });
      }
      return result;
    });
    if (updated.passwordHash !== account.passwordHash || updated.active !== account.active || updated.expiresAt?.getTime() !== account.expiresAt?.getTime()) {
      await this.prisma.session.deleteMany({ where: { accountId: id } });
    }
    return { id: updated.id, username: updated.username, displayName: updated.displayName, classroomId: updated.classroomId, expiresAt: updated.expiresAt, active: updated.active, isClassAdmin: updated.isClassAdmin, classroom: updated.classroom };
  }

  private cleanUsername(value?: string) {
    const username = value?.trim().toLowerCase();
    if (!username || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || username === 'admin') throw new BadRequestException('登录账号需为 3 到 32 位字母、数字、点、下划线或连字符');
    return username;
  }
  private validatePassword(password?: string): asserts password is string {
    const minimum = process.env.NODE_ENV === 'production' ? 8 : 1;
    if (!password || password.length < minimum || password.length > 128) throw new BadRequestException(`密码长度需为 ${minimum} 到 128 位`);
  }
  private parseExpiry(value?: string | null) {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('到期日期无效');
    date.setHours(23, 59, 59, 999);
    return date;
  }
  private async validClassroom(id?: string) {
    if (!id) throw new BadRequestException('请选择班级');
    const classroom = await this.prisma.classroom.findUnique({ where: { id } });
    if (!classroom) throw new BadRequestException('所选班级不存在');
    return classroom;
  }

  private async deleteStudentAccounts(ids: string[]) {
    const accounts = await this.prisma.account.findMany({ where: { id: { in: ids } }, include: { student: true, classroom: true } });
    if (accounts.length !== ids.length) throw new NotFoundException('部分学生账号不存在，请刷新列表后重试');

    const personalPapers = await this.prisma.paper.findMany({ where: { scope: 'PERSONAL', ownerAccountId: { in: ids } }, select: { id: true } });
    const personalPaperIds = personalPapers.map((paper) => paper.id);
    const classroomGroups = new Map<string, typeof accounts>();
    accounts.forEach((account) => classroomGroups.set(account.classroomId, [...(classroomGroups.get(account.classroomId) ?? []), account]));
    const replacements = await this.prisma.account.findMany({
      where: { classroomId: { in: [...classroomGroups.keys()] }, id: { notIn: ids } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, classroomId: true },
    });
    const replacementByClassroom = new Map(replacements.map((account) => [account.classroomId, account.id]));

    for (const [classroomId, group] of classroomGroups) {
      const creatorIds = group.map((account) => account.id);
      const [authoredPapers, authoredQuestions] = await Promise.all([
        this.prisma.paper.count({ where: { createdById: { in: creatorIds }, id: { notIn: personalPaperIds } } }),
        this.prisma.question.count({ where: { createdById: { in: creatorIds }, paperId: { notIn: personalPaperIds } } }),
      ]);
      if ((authoredPapers || authoredQuestions) && !replacementByClassroom.has(classroomId)) {
        throw new ConflictException(`该班级仍有由选中学生创建的共享内容；请保留一名同班学生账号，或先处理共享内容再删除。`);
      }
    }

    const images = personalPaperIds.length
      ? await this.prisma.questionImage.findMany({ where: { question: { paperId: { in: personalPaperIds } } }, select: { fileName: true } })
      : [];
    const studentIds = accounts.flatMap((account) => account.student ? [account.student.id] : []);
    await this.prisma.$transaction(async (transaction) => {
      for (const [classroomId, group] of classroomGroups) {
        const replacementId = replacementByClassroom.get(classroomId);
        if (!replacementId) continue;
        const creatorIds = group.map((account) => account.id);
        await transaction.paper.updateMany({ where: { createdById: { in: creatorIds }, id: { notIn: personalPaperIds } }, data: { createdById: replacementId } });
        await transaction.question.updateMany({ where: { createdById: { in: creatorIds }, paperId: { notIn: personalPaperIds } }, data: { createdById: replacementId } });
      }
      if (studentIds.length) await transaction.practiceAttempt.deleteMany({ where: { studentId: { in: studentIds } } });
      if (personalPaperIds.length) {
        await transaction.question.deleteMany({ where: { paperId: { in: personalPaperIds } } });
        await transaction.paper.deleteMany({ where: { id: { in: personalPaperIds } } });
      }
      await transaction.account.deleteMany({ where: { id: { in: ids } } });
    });
    await Promise.all(images.map((image) => this.storage.remove(image.fileName)));
    return { deleted: accounts.length };
  }
}
