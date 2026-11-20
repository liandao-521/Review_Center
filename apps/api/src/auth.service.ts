import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly loginFailures = new Map<string, { count: number; resetsAt: number }>();
  constructor(private readonly prisma: PrismaService) {}

  async status(token?: string) {
    if (!token) return { authenticated: false };
    const tokenHash = this.hashToken(token);
    const session = await this.prisma.session.findUnique({ where: { tokenHash }, include: { account: { include: { classroom: true, student: true } } } });
    if (!session || session.expiresAt < new Date()) return { authenticated: false };
    if (session.role === 'admin') return { authenticated: true, role: 'admin' };
    const account = session.account;
    if (!account || !account.active || (account.expiresAt && account.expiresAt < new Date())) {
      await this.prisma.session.deleteMany({ where: { tokenHash } });
      return { authenticated: false, expired: Boolean(account?.expiresAt && account.expiresAt < new Date()) };
    }
    return { authenticated: true, role: 'student', account: { id: account.id, studentId: account.student?.id, username: account.username, displayName: account.displayName, classroomId: account.classroomId, classroomName: account.classroom.name, expiresAt: account.expiresAt, isClassAdmin: account.isClassAdmin } };
  }

  async login(username: string, password: string, clientKey: string) {
    this.checkRateLimit(clientKey);
    let session: { token: string; expiresAt: Date };
    if (username === 'admin') {
      const configuredPassword = process.env.ADMIN_PASSWORD;
      if (!configuredPassword || !this.constantTimeEqual(password, configuredPassword)) return this.failLogin(clientKey);
      session = await this.createSession('admin');
    } else {
      const account = await this.prisma.account.findUnique({ where: { username } });
      if (!account || !account.active || (account.expiresAt && account.expiresAt < new Date()) || !(await bcrypt.compare(password, account.passwordHash))) return this.failLogin(clientKey);
      session = await this.createSession('student', account.id);
    }
    this.loginFailures.delete(clientKey);
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return { ...session, role: username === 'admin' ? 'admin' : 'student' };
  }

  async logout(token?: string) {
    if (token) await this.prisma.session.deleteMany({ where: { tokenHash: this.hashToken(token) } });
  }

  private checkRateLimit(clientKey: string) {
    const failures = this.loginFailures.get(clientKey);
    if (failures && failures.resetsAt > Date.now() && failures.count >= 8) {
      throw new HttpException('尝试次数过多，请 15 分钟后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private failLogin(clientKey: string): never {
    const now = Date.now();
    const failures = this.loginFailures.get(clientKey);
    if (!failures || failures.resetsAt <= now) this.loginFailures.set(clientKey, { count: 1, resetsAt: now + 15 * 60 * 1000 });
    else this.loginFailures.set(clientKey, { ...failures, count: failures.count + 1 });
    throw new UnauthorizedException('账号或密码不正确，或账号已停用/到期');
  }

  private async createSession(role: string, accountId?: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_MS);
    await this.prisma.session.create({ data: { tokenHash: this.hashToken(token), role, accountId, expiresAt } });
    return { token, expiresAt };
  }

  private hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private constantTimeEqual(first: string, second: string) {
    const a = createHash('sha256').update(first).digest();
    const b = createHash('sha256').update(second).digest();
    return timingSafeEqual(a, b);
  }
}
