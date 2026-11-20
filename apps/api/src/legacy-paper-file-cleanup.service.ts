import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

@Injectable()
export class LegacyPaperFileCleanupService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  async onApplicationBootstrap() {
    const [papers, questionImages] = await Promise.all([
      this.prisma.paper.findMany({ where: { fileName: { not: null } }, select: { id: true, fileName: true } }),
      this.prisma.questionImage.findMany({ select: { fileName: true } }),
    ]);
    if (!papers.length) return;
    const questionImageNames = new Set(questionImages.map((image) => image.fileName));
    await Promise.all(papers.map((paper) => questionImageNames.has(paper.fileName!) ? Promise.resolve() : this.storage.remove(paper.fileName)));
    await this.prisma.paper.updateMany({ where: { id: { in: papers.map((paper) => paper.id) } }, data: { fileName: null } });
  }
}
