# Deploy Syndicate Outpost to Pi5
# Usage: .\scripts\deploy_pi.ps1 <PI_USER> <PI_IP>

param (
    [string]$PI_USER = "pi",
    [string]$PI_IP = "192.168.1.78"
)

$REMOTE_DIR = "/home/$PI_USER/syndicate_outpost"
$LOCAL_DIR = "$PSScriptRoot/../don"

Write-Host "🚀 Deploying Syndicate Outpost to $PI_USER@$PI_IP..." -ForegroundColor Cyan

# 1. Create Remote Directory
Write-Host "📂 Creating remote directory..."
ssh $PI_USER@$PI_IP "mkdir -p $REMOTE_DIR"

# 2. Copy Files
Write-Host "md Copying payload (outpost.js, moltbook.js)..."
scp $LOCAL_DIR/outpost.js $PI_USER@$PI_IP:$REMOTE_DIR/
scp $LOCAL_DIR/moltbook.js $PI_USER@$PI_IP:$REMOTE_DIR/

# 3. Setup & Install
Write-Host "📦 Installing dependencies on Pi..."
ssh $PI_USER@$PI_IP "cd $REMOTE_DIR && npm init -y && npm install ws chalk dotenv axios"

# 4. Launch
Write-Host "🔥 Launching Outpost Agent..."
# Run in background via nohup
ssh $PI_USER@$PI_IP "cd $REMOTE_DIR && export DON_IP=192.168.1.175 && nohup node outpost.js > outpost.log 2>&1 &"

Write-Host "✅ Deployment Complete! The Outpost is live." -ForegroundColor Green
Write-Host "   Monitor logs via: ssh $PI_USER@$PI_IP 'tail -f $REMOTE_DIR/outpost.log'"
