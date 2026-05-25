$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

Write-Host "Testando estado atual..." -ForegroundColor Cyan
Invoke-RestMethod "http://127.0.0.1:8020/api/state"

Write-Host "Testando receitas..." -ForegroundColor Cyan
Invoke-RestMethod "http://127.0.0.1:8020/api/recipes"

Write-Host "Enviando comando de inicio..." -ForegroundColor Cyan
$Body = @{
    recipe_id = "PAD-001"
    tank_count = 1
    hose_id = "MG-02"
    oil_reservoir_l = 50
    operator = "OPERADOR 01"
    shift = "MANHA"
} | ConvertTo-Json

Invoke-RestMethod "http://127.0.0.1:8020/api/command/start" -Method POST -Body $Body -ContentType "application/json"