namespace ZKWAConnect.Api.DTOs;

public record LeadListResponse(IEnumerable<LeadDto> Leads, int Total, int Page, int TotalPages);
public record LeadDto(string Id, string? Name, string Phone, string Category, string Stage, string Priority, string? Message, bool SmsSent, DateTime CreatedAt);
public record UpdateLeadRequest(string? Stage, string? Priority, string? AgentId, string? Notes, decimal? Value);
