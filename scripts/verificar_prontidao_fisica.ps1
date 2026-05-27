$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Gateway = "http://127.0.0.1:8020"

Invoke-RestMethod "$Gateway/api/health"
Invoke-RestMethod "$Gateway/api/real/parameters"
Invoke-RestMethod "$Gateway/api/hardware/schema"
Invoke-RestMethod "$Gateway/api/hardware/desired-outputs"

Write-Host "Verificacao concluida." -ForegroundColor Green