$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Gateway = "http://127.0.0.1:8020"

Write-Host "Limpando base..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$Gateway/api/real/admin/clear-data" -Method POST -ContentType "application/json" -Body "{}" | Out-Null

Write-Host "Cadastrando receita..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$Gateway/api/real/recipes" -Method POST -ContentType "application/json" -Body (@{
    id = "REC-TESTE-01"
    title = "Receita Teste Real"
    name = "Receita Teste Real"
    tank_type = "Regulador prototipo"
    estimated_seconds = 180
    target_pressure_mbar = 8
    roots_start_pressure_mbar = 50
    b2_start_seconds = 24
    oil_start_seconds = 90
    stabilization_seconds = 140
    oil_per_tank_l = 30
    note = "Receita de teste do fluxo real."
} | ConvertTo-Json) | Out-Null

Write-Host "Cadastrando tanque..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$Gateway/api/real/tanks" -Method POST -ContentType "application/json" -Body (@{
    id = "TQ-TESTE-01"
    code = "TQ-TESTE-01"
    name = "Tanque teste"
    type = "Regulador prototipo"
    volume_liters = 50
    diameter_mm = 300
    height_mm = 500
    wall_thickness_mm = 3.4
    structural_limit_mbar = 35
} | ConvertTo-Json) | Out-Null

Write-Host "Cadastrando mangueira..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$Gateway/api/real/hoses" -Method POST -ContentType "application/json" -Body (@{
    id = "MG-TESTE-01"
    code = "MG-TESTE-01"
    label = "Mangueira teste real"
    length_m = 2
    internal_diameter_mm = 8
    calibrated_loss_mbar = 1.2
} | ConvertTo-Json) | Out-Null

Write-Host "Consultando parametros..." -ForegroundColor Cyan
Invoke-RestMethod "$Gateway/api/real/parameters"

Write-Host "Fluxo de cadastro validado." -ForegroundColor Green