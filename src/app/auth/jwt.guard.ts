import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * JWT stub guard.
 *
 * In production this would verify a JWT token from the
 * `Authorization: Bearer <token>` header. For the reference
 * architecture it accepts all requests so the gateway can be
 * exercised without a real auth provider.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Token present — in production, verify it here.
      return true;
    }

    // No token — allow the request (stub behaviour).
    return true;
  }
}
