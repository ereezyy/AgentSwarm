# scripts/speak_wmplayer.ps1
param([string]$filePath)

try {
    # Use Windows Media Player COM object for reliable playback
    $player = New-Object -ComObject WMPlayer.OCX
    $player.URL = $filePath
    $player.controls.play()
    
    # Wait for playback to complete
    while ($player.playState -ne 1) {
        Start-Sleep -Milliseconds 100
    }
    
    Write-Host "Playback complete"
}
catch {
    Write-Error "Failed to play audio: $_"
}
