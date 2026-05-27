$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Gateway = "http://127.0.0.1:8020"

Invoke-RestMethod `
    -Uri "$Gateway/api/hardware/mode" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"mode":"FISICO_HTTP"}' | Out-Null

for ($i = 1; $i -le 20; $i++) {
    $Pressure = [Math]::Max(8, 1013 * [Math]::Exp(-$i / 4.8))
    $B2 = $i -ge 8
    $Oil = $i -ge 14
    $Stage = "VACUO_INICIAL"

    if ($i -ge 8 -and $i -lt 14) {
        $Stage = "VACUO_PROFUNDO"
    }

    if ($i -ge 14) {
        $Stage = "INJECAO_DE_OLEO"
    }

    $OilInjected = if ($Oil) { ($i - 14) * 0.75 } else { 0 }

    $Payload = @{
        status = "EM_CICLO"
        stage = $Stage
        elapsed_seconds = $i
        pressure_machine_mbar = [Math]::Round($Pressure, 2)
        pumps = @{
            b1 = $true
            b2 = $B2
            oil = $Oil
        }
        oil = @{
            injected_l = [Math]::Round($OilInjected, 2)
            remaining_l = [Math]::Round(120 - $OilInjected, 2)
            flow_l_min = if ($Oil) { 1.5 } else { 0 }
        }
        hardware = @{
            sensor_online = $true
            plc_online = $true
            emergency = $false
        }
        tanks = @(
            @{
                id = "T1"
                pressure_mbar = [Math]::Round($Pressure + 1.2, 2)
                machine_pressure_mbar = [Math]::Round($Pressure, 2)
                hose_loss_mbar = 1.2
                oil_in_l = [Math]::Round($OilInjected, 2)
                risk_pct = 18
            }
        )
        alarm = $null
    } | ConvertTo-Json -Depth 10

    Invoke-RestMethod `
        -Uri "$Gateway/api/hardware/ingest" `
        -Method POST `
        -ContentType "application/json" `
        -Body $Payload | Out-Null

    Write-Host "Tick $i enviado | Pressao=$([Math]::Round($Pressure,2)) mbar | Etapa=$Stage" -ForegroundColor Green
    Start-Sleep -Seconds 1
}

Invoke-RestMethod "$Gateway/api/hardware/state"