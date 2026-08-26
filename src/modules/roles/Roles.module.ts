import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RolesController } from './Roles.controller';
import { RolesService } from './Roles.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('config.jwtSecret'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
