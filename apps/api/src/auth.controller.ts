import { Body, Controller, Get, Patch, Post, Req, Res, HttpCode, BadRequestException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { PrismaService } from './prisma.service';

const COOKIE = 'review_session';
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Get('status')
  status(@Req() req: Request) { return this.auth.status(req.cookies?.[COOKIE]); }

  @Patch('profile')
  @UseGuards(SessionGuard)
  async updateProfile(@Req() req: Request, @Body() body: { displayName?: string; currentPassword?: string; newPassword?: string }) {
    const accountId = (req as any).auth.accountId as string;
    const displayName = body?.displayName?.trim();
    const hasPasswordChange = body?.newPassword !== undefined && body.newPassword !== '';
    if (!displayName && !hasPasswordChange) throw new BadRequestException('请输入姓名或新密码');
    if (body.displayName !== undefined && (!displayName || displayName.length > 60)) throw new BadRequestException('姓名需为 1 到 60 个字符');

    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { passwordHash: true } });
    if (!account) throw new UnauthorizedException('账号不存在，请重新登录');
    let passwordHash: string | undefined;
    if (hasPasswordChange) {
      const minimum = process.env.NODE_ENV === 'production' ? 8 : 1;
      if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, account.passwordHash))) throw new UnauthorizedException('当前密码不正确');
      if (body.newPassword!.length < minimum || body.newPassword!.length > 128) throw new BadRequestException(`新密码长度需为 ${minimum} 到 128 位`);
      passwordHash = await bcrypt.hash(body.newPassword!, 12);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.account.update({ where: { id: accountId }, data: { ...(displayName ? { displayName } : {}), ...(passwordHash ? { passwordHash } : {}) } });
      if (displayName) await transaction.student.updateMany({ where: { accountId }, data: { name: displayName } });
      return result;
    });
    if (passwordHash) {
      const token = req.cookies?.[COOKIE] as string | undefined;
      const tokenHash = token ? createHash('sha256').update(token).digest('hex') : '';
      await this.prisma.session.deleteMany({ where: { accountId, ...(tokenHash ? { tokenHash: { not: tokenHash } } : {}) } });
    }
    return { displayName: updated.displayName };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username?: string; password?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!body.username?.trim() || !body.password) throw new BadRequestException('请输入账号和密码');
    const session = await this.auth.login(body.username.trim(), body.password, req.ip || 'unknown');
    res.cookie(COOKIE, session.token, cookieOptions());
    return { authenticated: true, expiresAt: session.expiresAt };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/' });
    return { authenticated: false };
  }
}
