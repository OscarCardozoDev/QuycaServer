import { registerAs } from '@nestjs/config';

export default registerAs('config', () => ({
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_URL_FRONT,
  /**
   * Base pública del frontend, para armar links absolutos que van por correo
   * (hoy: /invitation/<token>).
   *
   * Cae a CORS_URL_FRONT porque en desarrollo son la misma URL y así no hay
   * que tocar ningún .env para que funcione. Pero son dos cosas distintas y
   * en producción divergen: CORS_URL_FRONT es "qué origen puede llamarme" y
   * puede ser una lista o un dominio interno, mientras que FRONTEND_URL es
   * "qué URL le mando a una persona que todavía no tiene cuenta". Cuando eso
   * pase, se define FRONTEND_URL y este fallback deja de usarse.
   */
  frontendUrl: process.env.FRONTEND_URL ?? process.env.CORS_URL_FRONT,
  nodeEnv: process.env.NODE_ENV,
  resendKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.RESEND_EMAIL_FROM,
  semesterEndDate: process.env.SEMESTER_END_DATE,
  roles: {
    super_admin: process.env.ID_SUPER_ADMIN,
    institution: process.env.ID_INSTITUTION,
    professor: process.env.ID_PROFESSOR,
    user: process.env.ID_USER,
  },
}));
