# 🔒 Seguridad JWT: Configuración del Backend

Tu frontend ya está enviando el JWT token en el header `Authorization: Bearer nelisterjfsgnelson25092000thebest` en **todas** las requests.

## ¿Qué necesitas en el Backend?

Tu API debe validar que todas las requests incluyan EXACTAMENTE este token. Si no lo tienen o es incorrecto, **rechazar con 401 Unauthorized**.

---

## Node.js / Express - Middleware de Validación

### 1. Instalar dependencia
```bash
npm install express-jwt
```

### 2. Crear middleware de validación

**Archivo: `middleware/auth-middleware.js`**
```javascript
const EXPECTED_TOKEN = 'nelisterjfsgnelson25092000thebest';

/**
 * Middleware que valida el JWT token en el header Authorization.
 * Rechaza requests sin token o con token incorrecto.
 */
function validateApiToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  // Validar que existe el header
  if (!authHeader) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Authorization header'
    });
  }

  // Extraer token del formato "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Authorization header format. Use: Bearer <token>'
    });
  }

  const token = parts[1];

  // Validar que el token sea exactamente el esperado
  if (token !== EXPECTED_TOKEN) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }

  // Token válido, continuar
  next();
}

module.exports = validateApiToken;
```

### 3. Usar el middleware en tu app

**Archivo: `app.js` o `server.js`**
```javascript
const express = require('express');
const validateApiToken = require('./middleware/auth-middleware');

const app = express();

// Aplicar el middleware a TODAS las rutas de API
// (antes de definir las rutas)
app.use('/api/', validateApiToken);

// Ahora todas las rutas bajo /api/ requieren el token válido
app.post('/api/auth', (req, res) => {
  // Esta ruta SOLO será accesible con el token correcto
  res.json({ message: 'Autenticado' });
});

app.post('/api/device/login', (req, res) => {
  // Esta ruta SOLO será accesible con el token correcto
  res.json({ qr_code: '...' });
});

app.get('/api/messages', (req, res) => {
  // Esta ruta SOLO será accesible con el token correcto
  res.json({ results: [] });
});
```

---

## Python / Flask - Middleware de Validación

```python
from flask import Flask, request, jsonify
from functools import wraps

app = Flask(__name__)
EXPECTED_TOKEN = 'nelisterjfsgnelson25092000thebest'

def validate_api_token(f):
    """Decorator para validar el JWT token en requests."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Missing Authorization header'
            }), 401
        
        # Extraer token del formato "Bearer <token>"
        parts = auth_header.split(' ')
        if len(parts) != 2 or parts[0] != 'Bearer':
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Invalid Authorization header format'
            }), 401
        
        token = parts[1]
        
        if token != EXPECTED_TOKEN:
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Invalid token'
            }), 401
        
        return f(*args, **kwargs)
    
    return decorated_function

@app.route('/api/auth', methods=['POST'])
@validate_api_token
def login():
    return jsonify({'message': 'Autenticado'})

@app.route('/api/device/login', methods=['POST'])
@validate_api_token
def device_login():
    return jsonify({'qr_code': '...'})
```

---

## C# / .NET - Middleware de Validación

```csharp
using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

public class ApiTokenMiddleware
{
    private readonly RequestDelegate _next;
    private const string EXPECTED_TOKEN = "nelisterjfsgnelson25092000thebest";

    public ApiTokenMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var authHeader = context.Request.Headers["Authorization"].ToString();

        if (string.IsNullOrEmpty(authHeader))
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new
            {
                error = "Unauthorized",
                message = "Missing Authorization header"
            });
            return;
        }

        var parts = authHeader.Split(' ');
        if (parts.Length != 2 || parts[0] != "Bearer")
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new
            {
                error = "Unauthorized",
                message = "Invalid Authorization header format"
            });
            return;
        }

        var token = parts[1];
        if (token != EXPECTED_TOKEN)
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new
            {
                error = "Unauthorized",
                message = "Invalid token"
            });
            return;
        }

        await _next(context);
    }
}

// En Startup.cs o Program.cs
app.UseMiddleware<ApiTokenMiddleware>();
```

---

## ✅ Validación del Frontend

El frontend Angular ahora:
- ✅ Envía `Authorization: Bearer nelisterjfsgnelson25092000thebest` en **TODAS** las requests
- ✅ El interceptor se aplica automáticamente a cada HttpClient call
- ✅ No requiere cambios en el código de los servicios (es transparente)

---

## 🧪 Prueba de Seguridad

### Sin el token (debe fallar):
```bash
curl -X GET http://localhost:3001/messages
# Resultado: 401 Unauthorized
```

### Con el token correcto (debe funcionar):
```bash
curl -X GET http://localhost:3001/messages \
  -H "Authorization: Bearer nelisterjfsgnelson25092000thebest"
# Resultado: 200 OK + data
```

### Con token incorrecto (debe fallar):
```bash
curl -X GET http://localhost:3001/messages \
  -H "Authorization: Bearer wrong-token"
# Resultado: 401 Unauthorized
```

---

## 📝 Próximos Pasos

1. **Implementa** el middleware de validación en tu backend según tu tecnología
2. **Prueba** que rechaza requests sin token
3. **Verifica** que tu frontend sigue funcionando (todas las requests incluyen el token)
4. **Opcional:** Considera rotar el token en producción (usar variables de entorno, no hardcode)
