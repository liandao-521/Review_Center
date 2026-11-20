import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.review_session;
    if (!token || typeof token !== 'string') throw new UnauthorizedException('请先登录');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.session.findUnique({ where: { tokenHash }, include: { account: { include: { student: true } } } });
    if (!session || session.expiresAt < new Date()) {
      if (session) await this.prisma.session.delete({ where: { tokenHash } });
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
    if (session.role !== 'student' || !session.account || !session.account.active || !session.account.student) throw new ForbiddenException('当前账号无权访问学生题库');
    if (session.account.expiresAt && session.account.expiresAt < new Date()) {
      await this.prisma.session.deleteMany({ where: { accountId: session.accountId } });
      throw new UnauthorizedException('学生账号已到期，请联系管理员');
    }
    request.auth = { role: 'student', accountId: session.account.id, studentId: session.account.student.id, classroomId: session.account.classroomId, isClassAdmin: session.account.isClassAdmin };
    return true;
  }
}
