import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { CrossTenantGuard } from 'src/tenant/cross-tenant.guard';
import { LessonController } from './Lesson.controller';
import { LessonService } from './Lesson.service';
import { ChapterController } from './Chapter.controller';
import { ChapterService } from './Chapter.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('config.jwtSecret'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [LessonController, ChapterController],
  providers: [LessonService, ChapterService, TenantGuard, ContextRoleGuard, CrossTenantGuard],
  exports: [LessonService],
})
export class LessonModule {}
