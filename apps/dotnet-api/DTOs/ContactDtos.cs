namespace ZKWAConnect.Api.DTOs;

public record ContactListResponse(IEnumerable<ContactDto> Contacts, int Total, int Page, int TotalPages);
public record ContactDto(string Id, string Phone, string? Name, string? Email, string[] Labels, bool OptedIn, string? Source, DateTime CreatedAt);
public record CreateContactRequest(string Phone, string? Name, string? Email, string[]? Labels, bool OptedIn = true, string Source = "manual");
