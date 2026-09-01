import { Controller, Get } from '@nestjs/common';

interface ServiceHealth {
  service: string;
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

@Controller('health')
export class HealthController {
  @Get()
  async check(): Promise<{
    status: 'ok' | 'degraded';
    timestamp: string;
    services: ServiceHealth[];
  }> {
    const services = [
      { name: 'catalog-svc', url: 'http://localhost:4001/health' },
      { name: 'cart-svc', url: 'http://localhost:4002/health' },
      { name: 'user-svc', url: 'http://localhost:4003/health' },
    ];

    const results = await Promise.all(
      services.map(async (svc): Promise<ServiceHealth> => {
        const start = Date.now();
        try {
          const response = await fetch(svc.url, {
            signal: AbortSignal.timeout(3000),
          });
          const latencyMs = Date.now() - start;
          if (response.ok) {
            return { service: svc.name, status: 'up', latencyMs };
          }
          return {
            service: svc.name,
            status: 'down',
            latencyMs,
            error: `HTTP ${response.status}`,
          };
        } catch (err) {
          return {
            service: svc.name,
            status: 'down',
            latencyMs: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    const allUp = results.every((r) => r.status === 'up');
    return {
      status: allUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: results,
    };
  }
}
