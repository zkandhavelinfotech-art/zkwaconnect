using ZKWAConnect.Api.DTOs;
using ZKWAConnect.Api.Models;

namespace ZKWAConnect.Api.Services;

public interface ILeadService
{
    Task<(IEnumerable<Lead> Leads, int Total)> ListAsync(string tenantId, int page, int pageSize, string? stage, string? category);
    Task UpdateAsync(string id, string tenantId, UpdateLeadRequest req);
}

public interface IContactService
{
    Task<(IEnumerable<Contact> Contacts, int Total)> ListAsync(string tenantId, int page, int pageSize, string? search);
    Task<Contact> CreateAsync(string tenantId, CreateContactRequest req);
}

public interface IBillingService
{
    Task<IEnumerable<Invoice>> GetInvoicesAsync(string tenantId, int page, int pageSize);
}
