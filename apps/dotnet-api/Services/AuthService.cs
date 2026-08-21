using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using ZKWAConnect.Api.Data;
using ZKWAConnect.Api.DTOs;
using ZKWAConnect.Api.Models;

namespace ZKWAConnect.Api.Services;

public interface IAuthService
{
    Task<AuthResponse> LoginAsync(LoginRequest req);
    Task<AuthResponse> RegisterAsync(RegisterRequest req);
    Task<string> RefreshAsync(string refreshToken);
}

public class AuthService(ZkwaDbContext db, IConfiguration config) : IAuthService
{
    private readonly string _jwtSecret = config["JWT_SECRET"] ?? throw new InvalidOperationException("JWT_SECRET not set");

    public async Task<AuthResponse> LoginAsync(LoginRequest req)
    {
        var user = await db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Email == req.Email && u.IsActive)
            ?? throw new UnauthorizedAccessException("Invalid credentials");

        if (!BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials");

        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return BuildAuthResponse(user);
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest req)
    {
        if (await db.Users.AnyAsync(u => u.Email == req.Email))
            throw new InvalidOperationException("Email already registered");

        var slug   = req.CompanyName.ToLower().Replace(" ", "-") + "-" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var tenant = new Tenant
        {
            Name           = req.CompanyName, Slug = slug, Plan = req.Plan,
            PlanStatus     = "TRIAL", State = req.State, Gstin = req.Gstin,
            MessagesLimit  = req.Plan == "GROWTH" ? 10000 : 1000,
            TrialEndsAt    = DateTime.UtcNow.AddDays(14),
        };
        db.Tenants.Add(tenant);

        var user = new User
        {
            TenantId     = tenant.Id,
            Email        = req.Email,
            Name         = req.Name,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password, 12),
            Role         = "OWNER",
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        user.Tenant = tenant;
        return BuildAuthResponse(user);
    }

    public async Task<string> RefreshAsync(string token)
    {
        var stored = await db.RefreshTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == token && t.ExpiresAt > DateTime.UtcNow)
            ?? throw new UnauthorizedAccessException("Invalid or expired refresh token");

        return GenerateJwt(stored.User!.Id, stored.User.TenantId, stored.User.Role, 15);
    }

    private AuthResponse BuildAuthResponse(User user)
    {
        var access  = GenerateJwt(user.Id, user.TenantId, user.Role, 15);
        var refresh = GenerateJwt(user.Id, user.TenantId, user.Role, 60 * 24 * 30);

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId    = user.Id,
            Token     = refresh,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
        });
        db.SaveChanges();

        var t = user.Tenant!;
        return new AuthResponse(
            access, refresh,
            new UserDto(user.Id, user.Name, user.Email, user.Role),
            new TenantDto(t.Id, t.Name, t.Plan, t.PlanStatus, t.MessagesLimit, t.MessagesSent, t.WalletBalance)
        );
    }

    private string GenerateJwt(string uid, string tid, string role, int expiryMinutes)
    {
        var key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecret));
        var creds   = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims  = new[] {
            new Claim("uid",  uid),
            new Claim("tid",  tid),
            new Claim("role", role),
        };
        var token = new JwtSecurityToken(claims: claims, expires: DateTime.UtcNow.AddMinutes(expiryMinutes), signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public class LeadService(ZkwaDbContext db) : ILeadService
{
    public async Task<(IEnumerable<Models.Lead> Leads, int Total)> ListAsync(string tenantId, int page, int pageSize, string? stage, string? category)
    {
        var q = db.Leads.Where(l => l.TenantId == tenantId);
        if (!string.IsNullOrEmpty(stage))    q = q.Where(l => l.Stage    == stage);
        if (!string.IsNullOrEmpty(category)) q = q.Where(l => l.Category == category);
        var total = await q.CountAsync();
        var leads = await q.OrderByDescending(l => l.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return (leads, total);
    }
    public async Task UpdateAsync(string id, string tenantId, UpdateLeadRequest req)
    {
        var lead = await db.Leads.FirstOrDefaultAsync(l => l.Id == id && l.TenantId == tenantId)
            ?? throw new KeyNotFoundException("Lead not found");
        if (req.Stage    != null) lead.Stage    = req.Stage;
        if (req.Priority != null) lead.Priority = req.Priority;
        if (req.Notes    != null) lead.Notes    = req.Notes;
        if (req.Value    != null) lead.Value    = req.Value;
        if (req.Stage is "WON" or "LOST") lead.ClosedAt = DateTime.UtcNow;
        lead.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}

public class ContactService(ZkwaDbContext db) : IContactService
{
    public async Task<(IEnumerable<Models.Contact> Contacts, int Total)> ListAsync(string tenantId, int page, int pageSize, string? search)
    {
        var q = db.Contacts.Where(c => c.TenantId == tenantId);
        if (!string.IsNullOrEmpty(search)) q = q.Where(c => c.Phone.Contains(search) || (c.Name != null && c.Name.Contains(search)));
        var total    = await q.CountAsync();
        var contacts = await q.OrderByDescending(c => c.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return (contacts, total);
    }
    public async Task<Models.Contact> CreateAsync(string tenantId, CreateContactRequest req)
    {
        if (await db.Contacts.AnyAsync(c => c.TenantId == tenantId && c.Phone == req.Phone))
            throw new InvalidOperationException("Contact with this phone already exists");
        var c = new Models.Contact { TenantId = tenantId, Phone = req.Phone, Name = req.Name, Email = req.Email, Labels = req.Labels ?? [], OptedIn = req.OptedIn, Source = req.Source };
        db.Contacts.Add(c); await db.SaveChangesAsync(); return c;
    }
}

public class BillingService(ZkwaDbContext db) : IBillingService
{
    public async Task<IEnumerable<Models.Invoice>> GetInvoicesAsync(string tenantId, int page, int pageSize)
        => await db.Invoices.Where(i => i.TenantId == tenantId).OrderByDescending(i => i.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
}
