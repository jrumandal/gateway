import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  buildClientSchema,
  getIntrospectionQuery,
  type GraphQLSchema,
  type IntrospectionQuery,
} from 'graphql';
import { wrapSchema } from '@graphql-tools/wrap';
import { stitchSchemas } from '@graphql-tools/stitch';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';

interface ServiceConfig {
  name: string;
  endpoint: string;
}

const DEFAULT_SERVICES: ServiceConfig[] = [
  { name: 'catalog-svc', endpoint: 'http://localhost:4001/graphql' },
  { name: 'cart-svc', endpoint: 'http://localhost:4002/graphql' },
  { name: 'user-svc', endpoint: 'http://localhost:4003/graphql' },
];

async function introspectService(endpoint: string): Promise<GraphQLSchema> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  const result = (await response.json()) as { data: IntrospectionQuery };
  return buildClientSchema(result.data);
}

@Injectable()
export class GatewayService implements OnModuleInit {
  private readonly logger = new Logger(GatewayService.name);
  private _schema: GraphQLSchema | null = null;

  get schema(): GraphQLSchema {
    if (!this._schema) {
      throw new Error('Gateway schema not yet initialized.');
    }
    return this._schema;
  }

  async onModuleInit() {
    // Idempotent: main.ts may build the schema eagerly (before the NestJS
    // router is set up) and the lifecycle call during app.listen() then no-ops.
    if (this._schema) {
      return;
    }
    const services = this.resolveServices();
    this.logger.log(`Stitching ${services.length} service schemas...`);

    const wrappedSchemas = await Promise.all(
      services.map(async (svc) => {
        this.logger.log(`Introspecting ${svc.name} at ${svc.endpoint}...`);
        const schema = await introspectService(svc.endpoint);
        const typeCount = Object.keys(schema.getTypeMap()).length;
        this.logger.log(`Introspected ${svc.name}: ${typeCount} types`);
        return wrapSchema({
          schema,
          executor: buildHTTPExecutor({ endpoint: svc.endpoint }),
        });
      }),
    );

    this._schema = stitchSchemas({ subschemas: wrappedSchemas });
    const totalTypes = Object.keys(this._schema.getTypeMap()).length;
    this.logger.log(`Stitched schema ready: ${totalTypes} types`);
  }

  private resolveServices(): ServiceConfig[] {
    const envServices = process.env.GATEWAY_SERVICES;
    if (envServices) {
      return envServices
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((endpoint) => ({
          name: endpoint.replace(/^https?:\/\//, '').replace(/\/graphql$/, ''),
          endpoint,
        }));
    }
    return DEFAULT_SERVICES;
  }
}
