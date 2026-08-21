using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Serilog;
using ZKWAConnect.Api.Data;
using ZKWAConnect.Api.Services;
using ZKWAConnect.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ─────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateLogger();
builder.Host.UseSerilog();

// ── Database — Neon / PostgreSQL ─────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? builder.Configuration["DATABASE_URL"]
    ?? throw new InvalidOperationException("DATABASE_URL or ConnectionStrings:DefaultConnection not set.");

builder.Services.AddDbContext<ZkwaDbContext>(opt =>
    opt.UseNpgsql(connectionString));

// ── JWT Authentication ────────────────────────────────────────
var jwtSecret = builder.Configuration["JWT_SECRET"]
    ?? throw new InvalidOperationException("JWT_SECRET not set.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer           = false,
            ValidateAudience         = false,
            ClockSkew                = TimeSpan.FromSeconds(30),
        };
        // Support ?token= query param for SSE
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["token"].ToString();
                if (!string.IsNullOrEmpty(token)) ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ── CORS ─────────────────────────────────────────────────────
var frontendUrl = builder.Configuration["FRONTEND_URL"] ?? "http://localhost:3000";
builder.Services.AddCors(opt =>
    opt.AddDefaultPolicy(p => p
        .WithOrigins(frontendUrl.Split(','))
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials()));

// ── Controllers + Swagger ─────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "ZKWAConnect API (.NET)", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new()
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: Authorization: Bearer {token}",
        Name        = "Authorization",
        In          = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type        = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme      = "Bearer",
    });
    c.AddSecurityRequirement(new()
    {
        {
            new() { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// ── Services ─────────────────────────────────────────────────
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ILeadService, LeadService>();
builder.Services.AddScoped<IContactService, ContactService>();
builder.Services.AddScoped<IBillingService, BillingService>();
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

// ── Middleware ────────────────────────────────────────────────
app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseSerilogRequestLogging();

if (app.Environment.IsDevelopment() || app.Environment.IsStaging())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "ZKWAConnect .NET API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health check
app.MapGet("/health", () => new { status = "ok", version = "3.3.0-dotnet", timestamp = DateTime.UtcNow });

app.Run();
