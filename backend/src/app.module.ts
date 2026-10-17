import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.validation';
import { getLoggerOptions } from './config/logger.options';
import { PrismaModule } from './prisma/prisma.module';
import { SessionGuard } from './common/guards/session.guard';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { EmailModule } from './modules/email/email.module';
import { HealthModule } from './modules/health/health.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    LoggerModule.forRoot(getLoggerOptions()),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    MembershipsModule,
    InvitationsModule,
    AuditModule,
    EmailModule,
  ],
  providers: [
    // Every route requires a valid session cookie unless marked @Public().
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
