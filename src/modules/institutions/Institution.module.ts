import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { InstitutionController } from './Institution.controller';
import { PlansController } from './Plans.controller';
import { InstitutionService } from './Institution.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TenantGuard } from 'src/tenant/tenant.guard';
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
  controllers: [InstitutionController, PlansController],
  providers: [InstitutionService, TenantGuard, ContextRoleGuard],
})
export class InstitutionModule {}
