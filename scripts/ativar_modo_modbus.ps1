$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

param(
    [string]$HostPlc = "192.168.0.50",
    [int]$Porta = 502,
    [int]$UnitId = 1
)

$Gateway = "http://127.0.0.1:8020"

$Body = @{
    enabled = $true
    mode = "MODBUS_TCP"
    host = $HostPlc
    port = $Porta
    unit_id = $UnitId
    bench_outputs_allow_actuators = $false
} | ConvertTo-Json

Invoke-RestMethod -Uri "$Gateway/api/plc/config" -Method POST -ContentType "application/json" -Body $Body
Invoke-RestMethod -Uri "$Gateway/api/hardware/mode" -Method POST -ContentType "application/json" -Body '{"mode":"MODBUS_TCP"}'

Write-Host "Modo MODBUS_TCP ativado." -ForegroundColor Green