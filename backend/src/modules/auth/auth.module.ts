import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AuthFlowsService } from './auth-flows.service';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { OidcService } from './oidc.service';
import { OtpService } from './otp.service';
import { SessionsService } from './sessions.service';
import { TotpService } from './totp.service';
import { UsersService } from './users.service';

/** SDD module "Autentificare și conturi": SSO, externals, sessions, profile, user administration. */
@Module({
  controllers: [AuthController, MeController, AdminUsersController],
  providers: [AuthFlowsService, OidcService, OtpService, SessionsService, TotpService, UsersService],
  exports: [UsersService, SessionsService],
})
export class AuthModule {}
