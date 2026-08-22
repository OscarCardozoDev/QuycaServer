import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
// Importado por el alias `src/...`, NO por ruta relativa. El token
// PrismaService es un Symbol, y los Symbols se comparan por identidad: si este
// archivo carga el modulo por un especificador distinto al que usan los 13
// modulos de feature (`src/prisma/prisma.module`), Node lo registra dos veces
// en su cache y se crean DOS Symbols distintos. `app.get(PrismaService)` no
// encuentra entonces el provider y la app no arranca.
// Con `bun run build` no se nota, porque tsc-alias reescribe el alias a ruta
// relativa y las dos formas colapsan en una. Pero `bun run start:dev` es
// `nest start --watch`, que NO corre tsc-alias — y ahi se rompe.
import { PrismaService } from 'src/prisma/prisma.service';

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
