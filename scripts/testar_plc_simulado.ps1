$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Gateway = "http://127.0.0.1:8020"

Invoke-RestMethod -Uri "$Gateway/api/plc/config" -Method POST -ContentType "application/json" -Body '{"enabled":true,"mode":"SIMULATED","bench_outputs_allow_actuators":false}' | Out-Null
Invoke-RestMethod -Uri "$Gateway/api/hardware/mode" -Method POST -ContentType "application/json" -Body '{"mode":"BANCADA_SEGURA"}' | Out-Null

$Cases = @(
    @{ emergency = $false; sensor_out1_npn = $false; sensor_out2_pnp = $false; feedback_pump_b1 = $false; feedback_pump_b2 = $false; feedback_oil = $false; plc_online = $true; sensor_online = $true },
    @{ emergency = $false; sensor_out1_npn = $true;  sensor_out2_pnp = $false; feedback_pump_b1 = $true;  feedback_pump_b2 = $false; feedback_oil = $false; plc_online = $true; sensor_online = $true },
    @{ emergency = $false; sensor_out1_npn = $true;  sensor_out2_pnp = $true;  feedback_pump_b1 = $true;  feedback_pump_b2 = $true;  feedback_oil = $false; plc_online = $true; sensor_online = $true },
    @{ emergency = $true;  sensor_out1_npn = $true;  sensor_out2_pnp = $true;  feedback_pump_b1 = $false; feedback_pump_b2 = $false; feedback_oil = $false; plc_online = $true; sensor_online = $true }
)

foreach ($Case in $Cases) {
    Invoke-RestMethod -Uri "$Gateway/api/plc/simulate-inputs" -Method POST -ContentType "application/json" -Body ($Case | ConvertTo-Json) | Out-Null
    Invoke-RestMethod -Uri "$Gateway/api/plc/sync-once" -Method POST
    Start-Sleep -Seconds 1
}