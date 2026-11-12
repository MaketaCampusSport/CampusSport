import { Global, Module } from '@nestjs/common';
import { MailService, SmsService } from './messaging.service';

@Global()
@Module({
  providers: [MailService, SmsService],
  exports: [MailService, SmsService],
})
export class MessagingModule {}
