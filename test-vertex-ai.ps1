# Test Vertex AI Claude endpoint (PowerShell)

# Get access token
$TOKEN = (gcloud auth print-access-token 2>$null)

if ([string]::IsNullOrEmpty($TOKEN)) {
    Write-Error "No gcloud token. Run 'gcloud auth application-default login' first"
    exit 1
}

Write-Host "Testing Vertex AI Claude endpoint..." -ForegroundColor Cyan
Write-Host "Token: $($TOKEN.Substring(0, 20))..." -ForegroundColor Gray

# Test request
$Body = @{
    anthropic_version = "vertex-2023-10-16"
    max_tokens = 512
    temperature = 1
    messages = @(
        @{
            role = "user"
            content = @(
                @{
                    type = "text"
                    text = "Say exactly: Hello from Vertex AI!"
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

$Response = Invoke-RestMethod -Method Post `
    -Uri "https://aiplatform.googleapis.com/v1/projects/higgfails/locations/global/publishers/anthropic/models/claude-opus-4-6:streamRawPredict" `
    -Headers @{
        "Authorization" = "Bearer $TOKEN"
        "Content-Type" = "application/json; charset=utf-8"
    } `
    -Body $Body

$Response | ConvertTo-Json -Depth 10
