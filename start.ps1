# ========================================
# 智能長者個案管理系統 - 一鍵啟動
# ========================================

$ErrorActionPreference = "Stop"

# 配置
$nodePath = "C:\Users\Nolan\.workbuddy\binaries\node\versions\22.22.2\node.exe"
$serverDir = Join-Path $PSScriptRoot "server"
$serverFile = Join-Path $serverDir "app.js"
$port = 3001
$baseUrl = "http://localhost:$port"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  智能長者個案管理系統 - 一鍵啟動" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 檢查 Node.js
if (-not (Test-Path $nodePath)) {
    Write-Host "[錯誤] 找不到 Node.js：$nodePath" -ForegroundColor Red
    Write-Host "請確認該路徑下的 node.exe 存在" -ForegroundColor Yellow
    Read-Host "按 Enter 鍵退出"
    exit 1
}

# 檢查服務器文件
if (-not (Test-Path $serverFile)) {
    Write-Host "[錯誤] 找不到服務器入口文件：$serverFile" -ForegroundColor Red
    Read-Host "按 Enter 鍵退出"
    exit 1
}

# 檢測端口是否已被佔用
Write-Host "[檢查] 正在檢測端口 $port 狀態..." -ForegroundColor Gray
$portInUse = $false
try {
    $tcpTest = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    $portInUse = $tcpTest.TcpTestSucceeded
} catch {
    # PowerShell 5.1 可能沒有 Test-NetConnection
    try {
        $conn = New-Object System.Net.Sockets.TcpClient
        $conn.Connect("localhost", $port)
        $conn.Close()
        $portInUse = $true
    } catch {
        $portInUse = $false
    }
}

if ($portInUse) {
    Write-Host "[提示] 端口 $port 已被佔用，服務可能已在運行中" -ForegroundColor Green
    Write-Host ""
    Write-Host "正在打開瀏覽器..." -ForegroundColor Yellow
    Start-Process $baseUrl
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  瀏覽器已打開！" -ForegroundColor Green
    Write-Host "  $baseUrl" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "按 Enter 鍵退出"
    exit 0
}

# 啟動服務器
Write-Host "[啟動] 正在啟動後端服務..." -ForegroundColor Yellow
Write-Host "[啟動] 服務地址: $baseUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "[提示] 服務啟動後會自動打開瀏覽器" -ForegroundColor Gray
Write-Host "[提示] 請勿關閉服務器視窗，關閉後服務將停止" -ForegroundColor Gray
Write-Host ""

# 啟動 Node.js 服務器（在新視窗中）
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $nodePath
$psi.Arguments = "`"$serverFile`""
$psi.WorkingDirectory = $serverDir
$psi.UseShellExecute = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal

$process = [System.Diagnostics.Process]::Start($psi)
Write-Host "[啟動] 服務器進程已啟動 (PID: $($process.Id))" -ForegroundColor Gray

# 等待服務就緒
Write-Host "[等待] 正在等待服務就緒..." -ForegroundColor Yellow
$maxWait = 30
$waited = 0
$ready = $false

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # 服務尚未就緒，繼續等待
    }
}

if ($ready) {
    Write-Host "[就緒] 服務啟動成功！" -ForegroundColor Green
} else {
    Write-Host "[警告] 服務啟動超時（已等待 $maxWait 秒）" -ForegroundColor Yellow
    Write-Host "[提示] 可能是服務啟動較慢，嘗試強制打開瀏覽器..." -ForegroundColor Gray
}

# 打開瀏覽器
Write-Host ""
Write-Host "[瀏覽器] 正在打開前端頁面..." -ForegroundColor Yellow
Start-Process $baseUrl

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  系統已啟動！" -ForegroundColor Green
Write-Host "  前端頁面: $baseUrl" -ForegroundColor Gray
Write-Host "  服務器視窗請勿關閉" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "按 Enter 鍵關閉此視窗（服務器仍會繼續運行）"
