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
import { ClientsModule } from './modules/clients/clients.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { EmailModule } from './modules/email/email.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { HistoryModule } from './modules/history/history.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { LimitedModule } from './modules/limited/limited.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';
// Etapa 4 (docs/especificacion/etapa-4.md)
import { EconomicSettingsModule } from './modules/economic-settings/economic-settings.module';
import { CostsModule } from './modules/costs/costs.module';
import { AuthorizationsModule } from './modules/authorizations/authorizations.module';
import { BillingModule } from './modules/billing/billing.module';
// Etapa 6 (docs/especificacion/etapa-6.md)
import { WarrantyModule } from './modules/warranty/warranty.module';

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
    // Etapa 2 (docs/especificacion/etapa-2.md)
    PropertiesModule,
    ClientsModule,
    OrdersModule,
    NotificationsModule,
    LimitedModule,
    // Etapa 3 (docs/especificacion/etapa-3.md)
    StorageModule,
    FilesModule,
    HistoryModule,
    // Etapa 4 (docs/especificacion/etapa-4.md)
    EconomicSettingsModule,
    CostsModule,
    AuthorizationsModule,
    // Etapa 5 (docs/especificacion/etapa-5.md)
    BillingModule,
    // Etapa 6 (docs/especificacion/etapa-6.md)
    WarrantyModule,
  ],
  providers: [
    // Every route requires a valid session cookie unless marked @Public().
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
