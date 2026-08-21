using Microsoft.AspNetCore.Mvc;

namespace ZKWAConnect.Api.Controllers;

[ApiController]
public class HealthController : ControllerBase
{
    [HttpGet("/health")]
    public IActionResult Health() =>
        Ok(new { status = "ok", version = "3.3.0-dotnet", timestamp = DateTime.UtcNow });

    [HttpGet("/")]
    public IActionResult Root() => Redirect("/swagger");
}
