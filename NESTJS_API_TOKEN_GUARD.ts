import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

const EXPECTED_TOKEN = 'nelisterjfsgnelson25092000thebest';

/**
 * Guard que valida el JWT token en el header Authorization.
 * Solo permite requests con el token exacto esperado.
 * 
 * Uso en controlador:
 * @UseGuards(ApiTokenGuard)
 * @Post('/auth')
 * login() { ... }
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    // Validar que existe el header
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // Extraer token del formato "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException(
        'Invalid Authorization header format. Use: Bearer <token>'
      );
    }

    const token = parts[1];

    // Validar que el token sea exactamente el esperado
    if (token !== EXPECTED_TOKEN) {
      throw new UnauthorizedException('Invalid token');
    }

    // Token válido
    return true;
  }
}
