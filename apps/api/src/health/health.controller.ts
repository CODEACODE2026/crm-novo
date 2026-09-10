import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      ok: true,
      service: 'crm-novo-api',
      timestamp: new Date().toISOString(),
    };
  }
}
