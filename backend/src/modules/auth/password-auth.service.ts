import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { User } from '../../database/entities';
import { PasswordLoginDto, PasswordRegistrationDto } from './dto/auth.dto';
import { dummyPasswordHash, verifyPassword } from './password';
import { UsersService } from './users.service';

/**
 * Email + password sign-in for every role (FR-01). It replaces SSO, the admin TOTP step and the external
 * OTP flow, which are commented out in auth-flows.service.ts, oidc.service.ts and otp.service.ts.
 */
@Injectable()
export class PasswordAuthService {
  constructor(private readonly users: UsersService) {}

  register(dto: PasswordRegistrationDto): Promise<User> {
    return this.users.createWithPassword({
      fullName: dto.full_name,
      email: dto.email,
      password: dto.password,
      role: dto.role,
    });
  }

  /** Unknown email, account without a password and wrong password all answer INVALID_CREDENTIALS. */
  async login(dto: PasswordLoginDto): Promise<User> {
    const user = await this.users.findByEmail(dto.email);
    const hash = user ? await this.users.getPasswordHash(user.id) : null;
    // Always run scrypt once, so the response time does not reveal which emails are registered.
    const ok = await verifyPassword(dto.password, hash ?? (await dummyPasswordHash()));
    if (!user || !hash || !ok) throw new AppException('INVALID_CREDENTIALS');
    await this.users.touch(user.id);
    return user;
  }
}
