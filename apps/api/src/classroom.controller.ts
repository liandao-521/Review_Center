import { Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from './prisma.service';
import { SessionGuard } from './session.guard';

@Controller('classroom')
@UseGuards(SessionGuard)
export class ClassroomController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('members')
  async members(@Req() request: Request) {
    const classroomId = (request as any).auth.classroomId as string;
    return this.prisma.account.findMany({
      where: { classroomId },
      orderBy: [{ isClassAdmin: 'desc' }, { displayName: 'asc' }],
      select: { id: true, username: true, displayName: true, active: true, expiresAt: true, isClassAdmin: true, createdAt: true },
    });
  }

  @Post('transfer-admin')
  async transferAdmin(@Req() request: Request, @Body() body: { accountId?: unknown }) {
    const { accountId: currentAccountId, classroomId, isClassAdmin } = (request as any).auth;
    if (!isClassAdmin) throw new ForbiddenException('只有班级管理员可以转交管理员身份');
    if (typeof body?.accountId !== 'string' || !body.accountId.trim() || body.accountId === currentAccountId) throw new ConflictException('请选择同班级的其他成员');
    const target = await this.prisma.account.findFirst({
      where: { id: body.accountId, classroomId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    if (!target) throw new NotFoundException('找不到可用的同班级成员');
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: currentAccountId }, data: { isClassAdmin: false } });
      await tx.account.update({ where: { id: target.id }, data: { isClassAdmin: true } });
    });
    return { transferred: true, fromAccountId: currentAccountId, toAccountId: target.id };
  }
}
