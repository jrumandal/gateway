import { Module } from '@nestjs/common';
import { AppConfigModule, SharedModule } from '@server/shared';
import { AppController } from './app.controller';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [AppConfigModule, SharedModule, GatewayModule, HealthModule],
  controllers: [AppController],
})
export class AppModule {}
