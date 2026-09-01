import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { SqlInjectionGuard } from 'src/guards/sql.guard';
import { AccountThrottlerGuard } from 'src/guards/throttler.guard';
import { TenantMiddleware } from 'src/tenant/tenant.middleware';
import { AuthModule } from 'src/modules/auth/Auth.module';
import { UserModule } from 'src/modules/user/User.module';
import { PhotosModule } from 'src/modules/photos/Photos.module';
import { StylesModule } from 'src/modules/styles/Styles.module';
import { GroupModule } from 'src/modules/groups/Group.module';
import { ProductModule } from 'src/modules/products/Product.module';
import { EventModule } from 'src/modules/events/Event.module';
import { ScheduleModule } from 'src/modules/schedule/Schedule.module';
import { ClassesModule } from 'src/modules/classes/Classes.module';
import { RolesModule } from 'src/modules/roles/Roles.module';
import { InstitutionModule } from 'src/modules/institutions/Institution.module';
import { CategoriesModule } from 'src/modules/categories/Categories.module';
import { LessonModule } from 'src/modules/lessons/Lesson.module';
import { HealthController } from 'src/health/Health.controller';
import { RedisModule } from 'src/redis/redis.module';
import { join } from 'path';
import configurationApp from 'config/configuration-app';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `./env/${process.env.NODE_ENV}.env`,
      load: [configurationApp],
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'images'),
      serveRoot: '/images',
      serveStaticOptions: { index: false },
    }),
    // Audio de la pagina de musica. Carpeta y prefijo tienen que coincidir con
    // AUDIO_ROOT en src/utils/photosManagement.ts: esa URL se persiste en
    // Products.audioUrl, cambiarla despues cuesta una migracion de datos.
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'audio'),
      serveRoot: '/audio',
      serveStaticOptions: { index: false },
    }),
    // Default global flojo (1000/min) a propósito: no es la defensa real,
    // es solo una red contra el agotamiento de memoria. Un límite bajo (los
    // tutoriales ponen 100/min) revienta con el NAT del laboratorio — son
    // unas 3 requests por minuto por estudiante entre 30, y una sola carga
    // de la galería dispara más que eso. Los límites que importan van
    // `@Throttle()` ruta por ruta, solo donde hay costo real: credenciales,
    // correo saliente y creación pública de recursos. Ver
    // obsidian/Raw/Planes/2026-09-01-rate-limiting.md, sección 2.5.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
    RedisModule,
    AuthModule,
    UserModule,
    PhotosModule,
    StylesModule,
    GroupModule,
    ProductModule,
    EventModule,
    ScheduleModule,
    ClassesModule,
    RolesModule,
    InstitutionModule,
    CategoriesModule,
    LessonModule,
  ],
  // Sin modulo propio: es un solo controller sin service. PrismaModule es
  // @Global(), asi que el token PrismaService ya esta disponible aca.
  controllers: [HealthController],
  providers: [
    // Los APP_GUARD corren en orden de registro: el throttler va antes que
    // el SqlInjectionGuard porque el rechazo barato (contar una request) va
    // primero que el costoso (escanear body/query/params con regex).
    { provide: APP_GUARD, useClass: AccountThrottlerGuard },
    { provide: APP_GUARD, useClass: SqlInjectionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
