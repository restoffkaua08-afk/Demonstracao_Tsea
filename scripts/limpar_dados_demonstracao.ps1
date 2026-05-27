$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Gateway = "http://127.0.0.1:8020"

Write-Host "Limpando dados do Gateway..." -ForegroundColor Cyan

Invoke-RestMethod `
    -Uri "$Gateway/api/admin/clear-data" `
    -Method POST `
    -ContentType "application/json" `
    -Body "{}"

Write-Host ""
Write-Host "Backend limpo."
Write-Host "Para limpar cache/localStorage do navegador:"
Write-Host "Abra IHM e gerente, pressione F12, Console, rode:"
Write-Host "localStorage.clear(); location.reload();"