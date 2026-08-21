using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZKWAConnect.Api.DTOs;
using ZKWAConnect.Api.Services;

namespace ZKWAConnect.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
[Produces("application/json")]
public class AuthController(IAuthService auth) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var result = await auth.LoginAsync(req);
        return Ok(new { success = true, data = result });
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var result = await auth.RegisterAsync(req);
        return StatusCode(201, new { success = true, data = result });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        var token = await auth.RefreshAsync(req.RefreshToken);
        return Ok(new { success = true, data = new { accessToken = token } });
    }

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        var uid  = User.FindFirst("uid")?.Value;
        var tid  = User.FindFirst("tid")?.Value;
        var role = User.FindFirst("role")?.Value;
        return Ok(new { success = true, data = new { uid, tid, role } });
    }
}
