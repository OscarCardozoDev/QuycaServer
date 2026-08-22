import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { SqlInjectionGuard } from 'src/guards/sql.guard';
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
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: SqlInjectionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
