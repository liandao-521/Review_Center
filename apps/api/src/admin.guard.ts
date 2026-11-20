import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.review_session;
    if (!token || typeof token !== 'string') throw new UnauthorizedException('请先以管理员身份登录');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!session || session.expiresAt < new Date() || session.role !== 'admin') throw new UnauthorizedException('请先以管理员身份登录');
    request.auth = { role: 'admin' };
    return true;
  }
}
