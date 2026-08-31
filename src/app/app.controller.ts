import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      service: 'api-gateway',
      status: 'ok',
      graphql: '/graphql',
      health: '/health',
    };
  }
}
