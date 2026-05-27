$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Gateway = "http://127.0.0.1:8020"

Invoke-RestMethod `
    -Uri "$Gateway/api/hardware/mode" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"mode":"BANCADA_SEGURA"}'

Write-Host "Modo BANCADA_SEGURA ativado." -ForegroundColor Green