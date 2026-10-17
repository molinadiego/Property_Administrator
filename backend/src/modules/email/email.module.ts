import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConsoleEmailTransport,
  EMAIL_TRANSPORT,
  EmailService,
  EmailTransport,
  ResendEmailTransport,
} from './email.service';

/**
 * Transactional email (spec etapa-1.md §4.1, §4.3). The transport is selected
 * by EMAIL_TRANSPORT: 'console' (dev/test, logs with masked tokens) or
 * 'resend' (production, docs/stack.md §3).
 */
@Global()
@Module({
  providers: [
    EmailService,
    {
      provide: EMAIL_TRANSPORT,
      useFactory: (config: ConfigService): EmailTransport => {
        const transport = config.getOrThrow<'console' | 'resend'>('EMAIL_TRANSPORT');
        return transport === 'resend'
          ? new ResendEmailTransport(config)
          : new ConsoleEmailTransport();
      },
      inject: [ConfigService],
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
