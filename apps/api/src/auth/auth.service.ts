import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './authenticated-user';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findActiveByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const safeUser: AuthenticatedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    } satisfies JwtPayload);

    return { accessToken, user: safeUser };
  }

  async validateToken(token: string) {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    return this.usersService.findActiveById(payload.sub);
  }

  setAuthCookie(response: Response, token: string) {
    response.cookie('crm_novo_auth', token, this.getAuthCookieOptions());
  }

  clearAuthCookie(response: Response) {
    response.clearCookie('crm_novo_auth', this.getAuthCookieOptions());
  }

  private getAuthCookieOptions() {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    } as const;
  }
}
