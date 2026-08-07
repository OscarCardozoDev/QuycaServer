import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string>('config.corsOrigin'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  app.use(cookieParser());
  app.use(bodyParser.json({ limit: '6mb' }));
  app.use(bodyParser.urlencoded({ limit: '6mb', extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Quyca API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // Se usa una query real (SELECT 1) en lugar de $connect() porque, con el
  // driver adapter de pg (@prisma/adapter-pg), $connect() es un no-op: no
  // abre ningun socket y por lo tanto no puede detectar una base de datos
  // inalcanzable. El pool subyacente solo conecta de forma perezosa en la
  // primera query real. Si se "simplifica" esto de vuelta a $connect(), se
  // pierde silenciosamente la validacion fail-fast al arrancar.
  const prisma = app.get(PrismaService);
  await prisma.$queryRaw`SELECT 1`;

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

bootstrap();
