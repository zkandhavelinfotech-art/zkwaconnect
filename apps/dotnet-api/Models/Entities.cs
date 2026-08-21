using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZKWAConnect.Api.Models;

// ── Tenant ──────────────────────────────────────────────────
public class Tenant
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Plan { get; set; } = "STARTER";        // STARTER | GROWTH | ENTERPRISE
    public string PlanStatus { get; set; } = "TRIAL";    // TRIAL | ACTIVE | SUSPENDED | CANCELLED
    public string? Gstin { get; set; }
    public string? State { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? Pincode { get; set; }
    public string? Country { get; set; } = "IN";
    public decimal WalletBalance { get; set; } = 0;
    public int MessagesSent { get; set; } = 0;
    public int MessagesLimit { get; set; } = 1000;
    public DateTime? TrialEndsAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<User>        Users        { get; set; } = [];
    public ICollection<Lead>        Leads        { get; set; } = [];
    public ICollection<Contact>     Contacts     { get; set; } = [];
    public ICollection<Invoice>     Invoices     { get; set; } = [];
    public ICollection<Campaign>    Campaigns    { get; set; } = [];
    public ICollection<AuditLog>    AuditLogs    { get; set; } = [];
}

// ── User ─────────────────────────────────────────────────────
public class User
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    [ForeignKey(nameof(TenantId))] public Tenant? Tenant { get; set; }
    public string Email { get; set; } = "";
    public string Name { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "AGENT";  // OWNER|ADMIN|MANAGER|AGENT|VIEWER
    public string? Phone { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public bool TwoFAEnabled { get; set; } = false;
    public string? TwoFASecret { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}

// ── RefreshToken ─────────────────────────────────────────────
public class RefreshToken
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = "";
    [ForeignKey(nameof(UserId))] public User? User { get; set; }
    public string Token { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// ── WABAAccount ──────────────────────────────────────────────
public class WABAAccount
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    [ForeignKey(nameof(TenantId))] public Tenant? Tenant { get; set; }
    public string PhoneId { get; set; } = "";
    public string WabaId { get; set; } = "";
    public string PhoneNumber { get; set; } = "";
    public string? DisplayName { get; set; }
    public string? Nickname { get; set; }
    public string AccessToken { get; set; } = "";
    public string? AppSecret { get; set; }
    public string ApiVersion { get; set; } = "v20.0";
    public bool IsActive { get; set; } = true;
    public string? QualityRating { get; set; }
    public int TierLimit { get; set; } = 1000;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ── Contact ──────────────────────────────────────────────────
public class Contact
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    [ForeignKey(nameof(TenantId))] public Tenant? Tenant { get; set; }
    public string Phone { get; set; } = "";
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string[] Labels { get; set; } = [];
    public bool OptedIn { get; set; } = true;
    public string? Source { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Lead> Leads { get; set; } = [];
    public ICollection<Conversation> Conversations { get; set; } = [];
}

// ── Conversation ─────────────────────────────────────────────
public class Conversation
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string ContactId { get; set; } = "";
    [ForeignKey(nameof(ContactId))] public Contact? Contact { get; set; }
    public string? AssignedToId { get; set; }
    [ForeignKey(nameof(AssignedToId))] public User? AssignedTo { get; set; }
    public string Status { get; set; } = "OPEN";   // OPEN|PENDING|RESOLVED|ARCHIVED
    public string Channel { get; set; } = "whatsapp";
    public DateTime? LastMessageAt { get; set; }
    public int UnreadCount { get; set; } = 0;
    public string[] Labels { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Message> Messages { get; set; } = [];
}

// ── Message ──────────────────────────────────────────────────
public class Message
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ConversationId { get; set; } = "";
    [ForeignKey(nameof(ConversationId))] public Conversation? Conversation { get; set; }
    public string? WabaAccountId { get; set; }
    public string? WaMessageId { get; set; }
    public string Direction { get; set; } = "INBOUND";  // INBOUND|OUTBOUND
    public string Type { get; set; } = "TEXT";
    public string Content { get; set; } = "{}";         // jsonb
    public string Status { get; set; } = "SENT";
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
}

// ── Lead ─────────────────────────────────────────────────────
public class Lead
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    [ForeignKey(nameof(TenantId))] public Tenant? Tenant { get; set; }
    public string? ContactId { get; set; }
    [ForeignKey(nameof(ContactId))] public Contact? Contact { get; set; }
    public string Phone { get; set; } = "";
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string Category { get; set; } = "GENERAL";
    public string Source { get; set; } = "whatsapp";
    public string Stage { get; set; } = "NEW";
    public string Priority { get; set; } = "medium";
    public string? Message { get; set; }
    public string? Notes { get; set; }
    public string? AgentId { get; set; }
    public bool SmsSent { get; set; } = false;
    public bool AutoReplySent { get; set; } = false;
    public decimal? Value { get; set; }
    public DateTime? ClosedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ── Template ─────────────────────────────────────────────────
public class Template
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string? MetaId { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "UTILITY";
    public string Language { get; set; } = "en";
    public string Status { get; set; } = "PENDING";
    public string Components { get; set; } = "[]";      // jsonb
    public string? BodyText { get; set; }
    public string? FooterText { get; set; }
    public string? Buttons { get; set; }                // jsonb
    public int UsageCount { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ── Campaign ─────────────────────────────────────────────────
public class Campaign
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string? WabaAccountId { get; set; }
    public string? TemplateId { get; set; }
    public string Name { get; set; } = "";
    public string Status { get; set; } = "DRAFT";
    public string Audience { get; set; } = "{}";        // jsonb
    public string? Variables { get; set; }              // jsonb
    public DateTime? ScheduledAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int TotalCount { get; set; } = 0;
    public int SentCount { get; set; } = 0;
    public int DeliveredCount { get; set; } = 0;
    public int ReadCount { get; set; } = 0;
    public int FailedCount { get; set; } = 0;
    public int ReplyCount { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(TemplateId))] public Template? Template { get; set; }
    [ForeignKey(nameof(WabaAccountId))] public WABAAccount? WabaAccount { get; set; }
}

// ── Product ──────────────────────────────────────────────────
public class Product
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "INR";
    public string? ImageUrl { get; set; }
    public string? Sku { get; set; }
    public int? Stock { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ── Invoice ──────────────────────────────────────────────────
public class Invoice
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    [ForeignKey(nameof(TenantId))] public Tenant? Tenant { get; set; }
    public string InvoiceNumber { get; set; } = "";
    public string Type { get; set; } = "SUBSCRIPTION";
    public string? Plan { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Cgst { get; set; } = 0;
    public decimal Sgst { get; set; } = 0;
    public decimal Igst { get; set; } = 0;
    public decimal Total { get; set; }
    public string? TenantState { get; set; }
    public string? TenantGstin { get; set; }
    public string OurGstin { get; set; } = "33AABCZ1234A1Z5";
    public string HsnCode { get; set; } = "998315";
    public string? RazorpayPaymentId { get; set; }
    public string? PdfUrl { get; set; }
    public string Status { get; set; } = "PENDING";
    public DateTime? PaidAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// ── WalletTransaction ─────────────────────────────────────────
public class WalletTransaction
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string Type { get; set; } = "CREDIT";
    public decimal Amount { get; set; }
    public decimal Balance { get; set; }
    public string? Description { get; set; }
    public string? Reference { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// ── SmtpConfig ───────────────────────────────────────────────
public class SmtpConfig
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromEmail { get; set; } = "";
    public string FromName { get; set; } = "";
    public bool UseTls { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ── ApiKey ────────────────────────────────────────────────────
public class ApiKey
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    public string Name { get; set; } = "";
    public string KeyHash { get; set; } = "";
    public string KeyPrefix { get; set; } = "";
    public string[] Permissions { get; set; } = [];
    public bool IsActive { get; set; } = true;
    public DateTime? LastUsedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// ── AuditLog ──────────────────────────────────────────────────
public class AuditLog
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TenantId { get; set; } = "";
    [ForeignKey(nameof(TenantId))] public Tenant? Tenant { get; set; }
    public string? UserId { get; set; }
    [ForeignKey(nameof(UserId))] public User? User { get; set; }
    public string Action { get; set; } = "";
    public string Entity { get; set; } = "";
    public string? EntityId { get; set; }
    public string? Before { get; set; }    // jsonb
    public string? After { get; set; }     // jsonb
    public string? Ip { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// ── WebhookEvent ──────────────────────────────────────────────
public class WebhookEvent
{
    [Key] public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? TenantId { get; set; }
    public string? WabaAccountId { get; set; }
    public string EventType { get; set; } = "";
    public string? PhoneNumberId { get; set; }
    public string? WaMessageId { get; set; }
    public string Payload { get; set; } = "{}";  // jsonb
    public bool Processed { get; set; } = false;
    public DateTime? ProcessedAt { get; set; }
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
}
