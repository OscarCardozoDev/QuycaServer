import { registerAs } from '@nestjs/config';

export default registerAs('config', () => ({
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_URL_FRONT,
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
