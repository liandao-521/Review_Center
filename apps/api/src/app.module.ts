import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { QuestionsController } from './questions.controller';
import { PapersController } from './papers.controller';
import { FilesController } from './files.controller';
import { BackupController } from './backup.controller';
import { StorageService } from './storage.service';
import { LegacyPaperFileCleanupService } from './legacy-paper-file-cleanup.service';
import { QuestionPackagesController } from './question-packages.controller';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { ClassroomController } from './classroom.controller';

@Module({
  controllers: [AuthController, AdminController, ClassroomController, QuestionsController, PapersController, FilesController, BackupController, QuestionPackagesController],
  providers: [PrismaService, AuthService, SessionGuard, AdminGuard, StorageService, LegacyPaperFileCleanupService],
})
export class AppModule {}
