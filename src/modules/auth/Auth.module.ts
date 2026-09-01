import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './Auth.controller';
import { AuthService } from './Auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/jwt.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('config.jwtSecret'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  // RedisModule es @Global() (montado en AppModule) y JwtModule ya está
  // importado arriba: RefreshTokenService resuelve sus dependencias sin
  // agregar ningún import más.
  providers: [AuthService, AuthGuard, RefreshTokenService],
})
export class AuthModule {}
