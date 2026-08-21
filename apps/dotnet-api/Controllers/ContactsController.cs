using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZKWAConnect.Api.DTOs;
using ZKWAConnect.Api.Services;

namespace ZKWAConnect.Api.Controllers;

[ApiController]
[Route("api/v1/contacts")]
[Authorize]
[Produces("application/json")]
public class ContactsController(IContactService svc) : ControllerBase
{
    private string TenantId => User.FindFirst("tid")?.Value ?? "";

    [HttpGet]
    public async Task<IActionResult> List(int page = 1, int pageSize = 20, string? search = null)
    {
        var (contacts, total) = await svc.ListAsync(TenantId, page, pageSize, search);
        return Ok(new { success = true, data = new { contacts, total, page, totalPages = (int)Math.Ceiling((double)total / pageSize) } });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateContactRequest req)
    {
        var contact = await svc.CreateAsync(TenantId, req);
        return StatusCode(201, new { success = true, data = contact });
    }
}
