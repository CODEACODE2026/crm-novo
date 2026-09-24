import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.crm_novo_auth as string | undefined;

    if (!token) {
      throw new UnauthorizedException();
    }

    const user = await this.validateToken(token);

    if (!user) {
      throw new UnauthorizedException();
    }

    request.user = user;
    return true;
  }

  private async validateToken(token: string) {
    try {
      return await this.authService.validateToken(token);
    } catch (error) {
      if (this.isJwtValidationError(error)) {
        throw new UnauthorizedException();
      }

      throw error;
    }
  }

  private isJwtValidationError(error: unknown) {
    return (
      error instanceof Error &&
      ['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(error.name)
    );
  }
}
