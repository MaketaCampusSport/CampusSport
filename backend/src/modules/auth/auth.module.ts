import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AuthController } from './auth.controller';
import { AvatarsService } from './avatars.service';
import { DevAuthController } from './dev-auth.controller';
import { MeController } from './me.controller';
import { PasswordAuthService } from './password-auth.service';
import { SessionsService } from './sessions.service';
import { UserAvatarController } from './user-avatar.controller';
import { UsersService } from './users.service';
// DISABLED: SSO (OIDC), admin 2FA (TOTP) and the external OTP flow; sign-in is email + password.
// import { AuthFlowsService } from './auth-flows.service';
// import { OidcService } from './oidc.service';
// import { OtpService } from './otp.service';
// import { TotpService } from './totp.service';

/** SDD module "Autentificare și conturi": email + password sign-in, sessions, profile and photo, user administration. */
@Module({
  controllers: [AuthController, MeController, AdminUsersController, UserAvatarController, DevAuthController],
  providers: [
    AvatarsService,
    PasswordAuthService,
    SessionsService,
    UsersService,
    // DISABLED: AuthFlowsService, OidcService, OtpService, TotpService,
  ],
  exports: [UsersService, SessionsService],
})
export class AuthModule {}
