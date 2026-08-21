using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZKWAConnect.Api.Services;

namespace ZKWAConnect.Api.Controllers;

[ApiController]
[Route("api/v1/billing")]
[Authorize]
[Produces("application/json")]
public class BillingController(IBillingService svc) : ControllerBase
{
    private string TenantId => User.FindFirst("tid")?.Value ?? "";

    [HttpGet("invoices")]
    public async Task<IActionResult> Invoices(int page = 1, int pageSize = 10)
    {
        var invoices = await svc.GetInvoicesAsync(TenantId, page, pageSize);
        return Ok(new { success = true, data = invoices });
    }
}
