using Microsoft.EntityFrameworkCore;
using ZKWAConnect.Api.Models;

namespace ZKWAConnect.Api.Data;

/// <summary>
/// EF Core 8 DbContext — maps to the existing PostgreSQL schema
/// created by Prisma. Uses snake_case table names to match.
/// All migrations managed by Prisma (Node.js side).
/// This DbContext is READ/WRITE but does NOT run migrations.
/// </summary>
public class ZkwaDbContext(DbContextOptions<ZkwaDbContext> options) : DbContext(options)
{
    public DbSet<Tenant>             Tenants           { get; set; }
    public DbSet<User>               Users             { get; set; }
    public DbSet<RefreshToken>       RefreshTokens     { get; set; }
    public DbSet<WABAAccount>        WabaAccounts      { get; set; }
    public DbSet<Contact>            Contacts          { get; set; }
    public DbSet<Conversation>       Conversations     { get; set; }
    public DbSet<Message>            Messages          { get; set; }
    public DbSet<Lead>               Leads             { get; set; }
    public DbSet<Template>           Templates         { get; set; }
    public DbSet<Campaign>           Campaigns         { get; set; }
    public DbSet<Product>            Products          { get; set; }
    public DbSet<Invoice>            Invoices          { get; set; }
    public DbSet<WalletTransaction>  WalletTransactions{ get; set; }
    public DbSet<SmtpConfig>         SmtpConfigs       { get; set; }
    public DbSet<ApiKey>             ApiKeys           { get; set; }
    public DbSet<AuditLog>           AuditLogs         { get; set; }
    public DbSet<WebhookEvent>       WebhookEvents     { get; set; }

    protected override void OnModelCreating(ModelBuilder mb)
    {
        base.OnModelCreating(mb);

        // Map snake_case table names (Prisma default)
        mb.Entity<Tenant>().ToTable("tenants");
        mb.Entity<User>().ToTable("users")
            .HasIndex(u => new { u.TenantId, u.Email }).IsUnique();
        mb.Entity<RefreshToken>().ToTable("refresh_tokens");
        mb.Entity<WABAAccount>().ToTable("waba_accounts")
            .HasIndex(w => new { w.TenantId, w.PhoneId }).IsUnique();
        mb.Entity<Contact>().ToTable("contacts")
            .HasIndex(c => new { c.TenantId, c.Phone }).IsUnique();
        mb.Entity<Conversation>().ToTable("conversations");
        mb.Entity<Message>().ToTable("messages");
        mb.Entity<Lead>().ToTable("leads");
        mb.Entity<Template>().ToTable("templates")
            .HasIndex(t => new { t.TenantId, t.Name, t.Language }).IsUnique();
        mb.Entity<Campaign>().ToTable("campaigns");
        mb.Entity<Product>().ToTable("products");
        mb.Entity<Invoice>().ToTable("invoices")
            .HasIndex(i => i.InvoiceNumber).IsUnique();
        mb.Entity<WalletTransaction>().ToTable("wallet_transactions");
        mb.Entity<SmtpConfig>().ToTable("smtp_configs");
        mb.Entity<ApiKey>().ToTable("api_keys");
        mb.Entity<AuditLog>().ToTable("audit_logs");
        mb.Entity<WebhookEvent>().ToTable("webhook_events");

        // All string arrays (Postgres text[]) stored as text[]
        mb.Entity<Contact>().Property(c => c.Labels).HasColumnType("text[]");
        mb.Entity<Template>().Property(t => t.Components).HasColumnType("jsonb");
        mb.Entity<Campaign>().Property(c => c.Audience).HasColumnType("jsonb");
        mb.Entity<Campaign>().Property(c => c.Variables).HasColumnType("jsonb");
        mb.Entity<ApiKey>().Property(a => a.Permissions).HasColumnType("text[]");
        mb.Entity<Message>().Property(m => m.Content).HasColumnType("jsonb");
        mb.Entity<WebhookEvent>().Property(w => w.Payload).HasColumnType("jsonb");
        mb.Entity<AuditLog>().Property(a => a.Before).HasColumnType("jsonb");
        mb.Entity<AuditLog>().Property(a => a.After).HasColumnType("jsonb");
    }
}
