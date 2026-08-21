using System.Net;
using System.Text.Json;

namespace ZKWAConnect.Api.Middleware;

public class ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        try { await next(ctx); }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception for {Path}", ctx.Request.Path);
            await HandleExceptionAsync(ctx, ex);
        }
    }

    private static Task HandleExceptionAsync(HttpContext ctx, Exception ex)
    {
        var (statusCode, message) = ex switch
        {
            UnauthorizedAccessException => (HttpStatusCode.Unauthorized,  ex.Message),
            KeyNotFoundException        => (HttpStatusCode.NotFound,      ex.Message),
            InvalidOperationException   => (HttpStatusCode.BadRequest,    ex.Message),
            _                          => (HttpStatusCode.InternalServerError, "Internal server error"),
        };

        ctx.Response.ContentType = "application/json";
        ctx.Response.StatusCode  = (int)statusCode;

        return ctx.Response.WriteAsync(JsonSerializer.Serialize(new
        {
            success = false,
            error   = message,
        }));
    }
}
