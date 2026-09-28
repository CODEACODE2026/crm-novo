import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

export type SchedulerEnvKey = 'BILLING_SCHEDULER_ENABLED' | 'RECOVERY_SCHEDULER_ENABLED';

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const csrfExcludedPaths = [
  '/auth/login',
  '/health',
  '/payment-webhooks',
  '/whatsapp/webhook/kirago',
];

export function parseBooleanFlag(value: string | undefined) {
  if (value === undefined || value.trim() === '') return undefined;

  const normalized = value.trim();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return null;
}

export function isSchedulerEnabled(value: string | undefined) {
  return parseBooleanFlag(value) === true;
}

export function isSchedulerDisabled(value: string | undefined) {
  return !isSchedulerEnabled(value);
}

export function parseCorsOrigins(value: string) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function assertAllowedOrigin(origin: string | undefined, allowedOrigins: string[]) {
  if (!origin) return;

  if (!allowedOrigins.includes(origin)) {
    throw new ForbiddenException('Origem nao autorizada.');
  }
}

export function createOriginProtectionMiddleware(allowedOrigins: string[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    try {
      if (!mutatingMethods.has(request.method) || isCsrfExcludedPath(request.path)) {
        next();
        return;
      }

      const hasAuthCookie = Boolean(request.cookies?.crm_novo_auth);
      if (!hasAuthCookie) {
        next();
        return;
      }

      assertAllowedOrigin(request.headers.origin, allowedOrigins);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function assertProductionCorsOrigins(origins: string[]) {
  if (!origins.length) {
    throw new Error('CORS_ORIGIN deve listar ao menos uma origem.');
  }

  if (origins.includes('*')) {
    throw new Error('CORS_ORIGIN nao pode usar * em production com credentials=true.');
  }

  for (const origin of origins) {
    let parsed: URL;

    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGIN invalida: ${origin}`);
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('CORS_ORIGIN deve usar HTTPS em production.');
    }
  }
}

export function assertProductionSchedulerFlag(key: SchedulerEnvKey, value: string | undefined) {
  const parsed = parseBooleanFlag(value);

  if (parsed !== true && parsed !== false) {
    throw new Error(`${key} deve ser explicitamente true ou false em production.`);
  }
}

export function validateKiragoWebhookToken(candidate: string | undefined, expected: string) {
  if (!candidate || !expected) {
    throw new ForbiddenException('Webhook Kirago nao autorizado.');
  }

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  if (
    candidateBuffer.length !== expectedBuffer.length ||
    !cryptoTimingSafeEqual(candidateBuffer, expectedBuffer)
  ) {
    throw new ForbiddenException('Webhook Kirago nao autorizado.');
  }
}

function isCsrfExcludedPath(path: string) {
  return csrfExcludedPaths.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

function cryptoTimingSafeEqual(left: Buffer, right: Buffer) {
  try {
    return timingSafeEqual(left, right);
  } catch {
    throw new BadRequestException('Falha ao validar origem da requisicao.');
  }
}
