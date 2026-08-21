# ZKWAConnect .NET Core 8 API

ASP.NET Core 8 Minimal API — mirrors the Node.js Fastify API.
Uses the same PostgreSQL database and JWT secret.

## Architecture

```
Same PostgreSQL DB (via EF Core 8)
Same JWT_SECRET    (tokens work across both APIs)
Port 5000          (Node.js API on 4000, .NET on 5000)
Swagger            http://localhost:5000/swagger
```

## Run locally

```bash
# Prerequisites: .NET 8 SDK

cd apps/dotnet-api

# Restore packages
dotnet restore

# Set env vars (or edit appsettings.Development.json)
export DATABASE_URL="postgresql://zkwa:zkwa_password@localhost:5432/zkwaconnect"
export JWT_SECRET="dev-jwt-secret-minimum-32-characters-long-here"

# Run
dotnet run
```

API: http://localhost:5000
Swagger: http://localhost:5000/swagger

## Endpoints implemented

| Method | Path | Description |
|--------|------|-------------|
| GET    | /health | Health check |
| POST   | /api/v1/auth/register | Register tenant + owner |
| POST   | /api/v1/auth/login | Login, returns JWT |
| POST   | /api/v1/auth/refresh | Refresh access token |
| GET    | /api/v1/auth/me | Current user info |
| GET    | /api/v1/leads | List leads (filterable) |
| PATCH  | /api/v1/leads/:id | Update lead stage/priority |
| GET    | /api/v1/contacts | List contacts |
| POST   | /api/v1/contacts | Create contact |
| GET    | /api/v1/billing/invoices | List GST invoices |

## Shared JWT tokens

Since both APIs share JWT_SECRET, a token issued by the Node.js API
works with the .NET API and vice versa. The token claims `uid`, `tid`,
and `role` are identical.

## Docker

```bash
docker build -t zkwaconnect-dotnet .
docker run -p 5000:5000 \
  -e DATABASE_URL="..." \
  -e JWT_SECRET="..." \
  zkwaconnect-dotnet
```

## Add to railway.worker.toml for Railway deployment

```toml
[build]
builder = "dockerfile"
dockerfilePath = "apps/dotnet-api/Dockerfile"

[deploy]
startCommand = "dotnet ZKWAConnect.Api.dll"
healthcheckPath = "/health"
```
