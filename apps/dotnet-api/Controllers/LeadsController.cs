using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZKWAConnect.Api.DTOs;
using ZKWAConnect.Api.Services;

namespace ZKWAConnect.Api.Controllers;

[ApiController]
[Route("api/v1/leads")]
[Authorize]
[Produces("application/json")]
public class LeadsController(ILeadService svc) : ControllerBase
{
    private string TenantId => User.FindFirst("tid")?.Value ?? "";

    [HttpGet]
    public async Task<IActionResult> List(int page = 1, int pageSize = 20, string? stage = null, string? category = null)
    {
        var (leads, total) = await svc.ListAsync(TenantId, page, pageSize, stage, category);
        return Ok(new { success = true, data = new { leads, total, page, totalPages = (int)Math.Ceiling((double)total / pageSize) } });
    }

    [HttpPatch("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateLeadRequest req)
    {
        await svc.UpdateAsync(id, TenantId, req);
        return Ok(new { success = true });
    }
}
