import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string>('config.corsOrigin'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  app.use(cookieParser());
  // Sin esto, Express reporta en req.ip la IP del contenedor de nginx, no la
  // del cliente: TODO el trafico compartiria un solo contador de rate limit y
  // el limite seria global en vez de por cliente. El `1` significa "confia en
  // un solo proxy delante" y es correcto SOLO porque nginx sobrescribe
  // X-Forwarded-For con $remote_addr (QuycaClient/nginx.conf). Si esa linea
  // vuelve a $proxy_add_x_forwarded_for, esto pasa a ser falsificable por el
  // cliente.
  app.set('trust proxy', 1);
  // 20mb y no 6mb desde la pagina de musica: un mp3 de 4:30 a 160 kbps pesa
  // 5,4 MB y en base64 son 7,2 MB, mas la portada en el mismo body. El costo es
  // que cada request se materializa entera en memoria; se acepta hasta que la
  // subida pase a multipart. Ver obsidian/Tareas/Musica-Lo-que-falta.
  app.use(bodyParser.json({ limit: '20mb' }));
  app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger NO se monta en produccion. `/api-docs-json` publica el esquema
  // OpenAPI completo —cada ruta, cada DTO, cada campo y cada validacion—, que
  // es el mapa de la superficie de ataque servido a cualquiera que pase.
  //
  // No se protege con contrasena ni se bloquea en nginx: no registrar la ruta
  // es lo unico que garantiza que no exista. Un bloqueo en el proxy deja el
  // handler vivo detras, alcanzable el dia que alguien exponga el 3000.
  //
  // `bun run generate:types` del frontend no se ve afectado: apunta a
  // localhost:3000, donde NODE_ENV es development y esto si se monta.
  //
  // La sonda de produccion es GET /health (src/health/Health.controller.ts).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Quyca API')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
  }

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
