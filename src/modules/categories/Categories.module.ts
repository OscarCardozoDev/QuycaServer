import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CategoriesController } from './Categories.controller';
import { CategoriesService } from './Categories.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TenantGuard } from 'src/guards/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('config.jwtSecret'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService, TenantGuard, ContextRoleGuard],
})
export class CategoriesModule {}
