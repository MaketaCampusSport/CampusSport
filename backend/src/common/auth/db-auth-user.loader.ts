import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities';
import { AuthUser, AuthUserLoader } from './auth.types';

export function toAuthUser(u: User): AuthUser {
  return {
    id: u.id,
    role: u.role,
    fullName: u.fullName,
    email: u.email,
    status: u.status,
    suspendedUntil: u.suspendedUntil,
  };
}

/** Re-reads the user on each request so role changes and suspensions apply immediately. */
@Injectable()
export class DbAuthUserLoader implements AuthUserLoader {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async load(userId: string): Promise<AuthUser | null> {
    const user = await this.users.findOneBy({ id: userId });
    return user ? toAuthUser(user) : null;
  }
}
