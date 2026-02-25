# scripts/run_gemini_cli.ps1
# Shortcut to run the Gemini CLI from OpenClaw

$OpenClawPath = Join-Path $PSScriptRoot "../skills/openclaw"
$GeminiCliAuthPath = Join-Path $OpenClawPath "src/commands/auth-choice.apply.google-gemini-cli.ts"

Write-Host "--- Syndicate Gemini Bridge ---" -ForegroundColor Cyan

if (Test-Path $GeminiCliAuthPath) {
    Write-Host "[BRIDGE]: Located Gemini CLI components in OpenClaw." -ForegroundColor Green
    Write-Host "[BRIDGE]: Launching auth/config selector..." -ForegroundColor Yellow
    
    # Try to run via ts-node if available, or just guide the user
    # For now, we'll provide the command line to the user
    Write-Host "`nTo run the Gemini CLI, use the following command in the OpenClaw directory:"
    Write-Host "npx ts-node src/commands/auth-choice.apply.google-gemini-cli.ts" -ForegroundColor White
    
    # Optional: Automatically try to run it if ts-node is found
    # npx ts-node $GeminiCliAuthPath
} else {
    Write-Host "[ERROR]: Could not find Gemini CLI components at $GeminiCliAuthPath" -ForegroundColor Red
}

Pause
