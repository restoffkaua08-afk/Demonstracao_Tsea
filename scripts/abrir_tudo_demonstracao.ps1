$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Repo = Split-Path $PSScriptRoot -Parent

$GatewayScript = "$Repo\scripts\abrir_gateway.ps1"
$GatewayBackend = "$Repo\gateway_fisico\backend"
$GerenteFrontend = "$Repo\sistema_gerente\frontend"
$IhmFrontend = "$Repo\ihm_operador\frontend"

function Stop-Port {
    param([int]$Port)

    $Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

    if ($Connections) {
        $Pids = $Connections | Select-Object -ExpandProperty OwningProcess -Unique

        foreach ($PidAtual in $Pids) {
            Stop-Process -Id $PidAtual -Force -ErrorAction SilentlyContinue
        }
    }
}

function Open-Terminal {
    param([string]$Title, [string]$Command)

    Start-Process powershell.exe -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        "`$host.UI.RawUI.WindowTitle = '$Title'; $Command"
    )
}

Stop-Port 8020
Stop-Port 5173
Stop-Port 5178

if (Test-Path $GatewayScript) {
    Open-Terminal "TSEA Gateway - 8020" "cd '$Repo'; . '$GatewayScript'"
} else {
    Open-Terminal "TSEA Gateway - 8020" "cd '$GatewayBackend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8020 --reload"
}

Start-Sleep -Seconds 8

Open-Terminal "TSEA Gerente - 5173" "cd '$GerenteFrontend'; npm install; npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
Start-Sleep -Seconds 4
Open-Terminal "TSEA IHM - 5178" "cd '$IhmFrontend'; npm install; npm run dev -- --host 127.0.0.1 --port 5178 --strictPort"

Start-Sleep -Seconds 8

Start-Process "http://127.0.0.1:8020/docs"
Start-Process "http://127.0.0.1:8020/api/real/parameters"
Start-Process "http://127.0.0.1:5173"
Start-Process "http://127.0.0.1:5178"

Write-Host "Aberto." -ForegroundColor Green
Write-Host "Gateway: http://127.0.0.1:8020/docs"
Write-Host "Parametros: http://127.0.0.1:8020/api/real/parameters"
Write-Host "Gerente: http://127.0.0.1:5173"
Write-Host "IHM: http://127.0.0.1:5178"