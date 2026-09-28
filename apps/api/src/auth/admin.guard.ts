import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (request.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Permissao administrativa obrigatoria.');
    }

    return true;
  }
}
