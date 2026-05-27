$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Gateway = "http://127.0.0.1:8020"

Invoke-RestMethod -Uri "$Gateway/api/plc/force-safe" -Method POST
Write-Host "PLC forçado para estado seguro." -ForegroundColor Green