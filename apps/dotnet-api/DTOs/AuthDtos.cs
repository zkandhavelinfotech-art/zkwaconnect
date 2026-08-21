namespace ZKWAConnect.Api.DTOs;

public record LoginRequest(string Email, string Password);
public record RegisterRequest(string Email, string Password, string Name, string CompanyName, string Plan = "STARTER", string? State = null, string? Gstin = null);
public record RefreshRequest(string RefreshToken);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record AuthResponse(string AccessToken, string RefreshToken, UserDto User, TenantDto Tenant);
public record UserDto(string Id, string Name, string Email, string Role);
public record TenantDto(string Id, string Name, string Plan, string PlanStatus, int MessagesLimit, int MessagesSent, decimal WalletBalance);
