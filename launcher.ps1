# launcher.ps1
# One-click premium launcher for The Syndicate

Write-Host "--- Initiating Syndicate Launcher ---" -ForegroundColor Cyan

# Start the launcher server in the background
$LauncherProcess = Start-Process node -ArgumentList "launcher_server.mjs" -WindowStyle Hidden -PassThru

Write-Host "[LAUNCHER]: Server active." -ForegroundColor Green
Write-Host "[LAUNCHER]: Opening interface..." -ForegroundColor Yellow

# Open the browser to the launcher page
Start-Process "http://localhost:18888"

Write-Host "`nThe Syndicate is ready. Click 'ACTIVATE SWARM' in your browser." -ForegroundColor White
Write-Host "Press any key to close this window (The launcher server will stay active)." -ForegroundColor Gray

$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
