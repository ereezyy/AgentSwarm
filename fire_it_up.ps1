Write-Host "FIRING UP THE SYNDICATE..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd dashboard; npm run dev"
Write-Host "SYSTEMS ONLINE."
