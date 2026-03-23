# 🔐 Seguridad JWT en NestJS - Implementación

Tu frontend envía: `Authorization: Bearer nelisterjfsgnelson25092000thebest`

## Opción 1: Guard Global (RECOMENDADO - Más Simple)

### 1. Crear el Guard

**Archivo: `src/guards/api-token.guard.ts`**
```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

const EXPECTED_TOKEN = 'nelisterjfsgnelson25092000thebest';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException(
        'Invalid Authorization header format. Use: Bearer <token>'
      );
    }

    const token = parts[1];
    if (token !== EXPECTED_TOKEN) {
      throw new UnauthorizedException('Invalid token');
    }

    return true;
  }
}
```

### 2. Aplicar globalmente en `main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiTokenGuard } from './guards/api-token.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Aplicar el guard a TODOS los endpoints
  app.useGlobalGuards(new ApiTokenGuard());

  await app.listen(3001);
}
bootstrap();
```

**Listo.** Ahora TODAS tus rutas requieren el token válido. 🎯

---

## Opción 2: Solo rutas específicas

Si quieres proteger solo ciertos endpoints, puedes aplicar el guard por controlador o ruta:

```typescript
import { UseGuards, Controller, Post } from '@nestjs/common';
import { ApiTokenGuard } from './guards/api-token.guard';

@Controller('device')
@UseGuards(ApiTokenGuard)  // Protege TODAS las rutas del controlador
export class DeviceController {
  @Post('login')
  async login() {
    return { qr_code: '...' };
  }

  @Post('logout')
  async logout() {
    return { message: 'Desconectado' };
  }
}

@Controller('messages')
@UseGuards(ApiTokenGuard)
export class MessagesController {
  @Get()
  async getMessages() {
    return { results: [] };
  }
}

@Controller('auth')
@UseGuards(ApiTokenGuard)  // Incluso /auth requiere el token
export class AuthController {
  @Post()
  async login() {
    return { token: '...' };
  }
}
```

---

## Opción 3: Middleware Custom (Alternativa)

Si prefieres un middleware en lugar de un Guard:

**Archivo: `src/middleware/api-token.middleware.ts`**
```typescript
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const EXPECTED_TOKEN = 'nelisterjfsgnelson25092000thebest';

@Injectable()
export class ApiTokenMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    const token = parts[1];
    if (token !== EXPECTED_TOKEN) {
      throw new UnauthorizedException('Invalid token');
    }

    next();
  }
}
```

**Aplicar en `app.module.ts`:**
```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ApiTokenMiddleware } from './middleware/api-token.middleware';

@Module({
  // ... providers, controllers, etc
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApiTokenMiddleware)
      .forRoutes('*'); // Aplica a todos los endpoints
  }
}
```

---

## ✅ Comparativa

| Opción | Ventajas | Desventajas |
|--------|----------|------------|
| **Guard Global** | Simple, limpio, fácil de aplicar | Aplica a todo |
| **Guard por ruta** | Control granular | Más verboso |
| **Middleware** | Ejecuta antes que Guards | Menos declarativo |

**Recomendación:** Usa **Opción 1 (Guard Global)** - Es la más simple y la forma estándar en NestJS. 🚀

---

## 🧪 Prueba

### Sin token (debe fallar):
```bash
curl -X GET http://localhost:3001/messages
# Resultado: 401 Unauthorized - Missing Authorization header
```

### Con token correcto (debe funcionar):
```bash
curl -X GET http://localhost:3001/messages \
  -H "Authorization: Bearer nelisterjfsgnelson25092000thebest"
# Resultado: 200 OK + data
```

### Con token incorrecto (debe fallar):
```bash
curl -X GET http://localhost:3001/messages \
  -H "Authorization: Bearer wrong-token"
# Resultado: 401 Unauthorized - Invalid token
```

---

## 📝 Resumen

1. Copia el código del Guard (Opción 1) a `src/guards/api-token.guard.ts`
2. Aplica globalmente en `main.ts` con `app.useGlobalGuards(new ApiTokenGuard())`
3. Tu frontend Angular envía automáticamente el token en TODAS las requests
4. NestJS valida el token en CADA request - sin token o token incorrecto = 401 Unauthorized
