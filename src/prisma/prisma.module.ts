import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, createPrismaClient } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createPrismaClient(configService),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
