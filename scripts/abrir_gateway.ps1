$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Repo = Split-Path $PSScriptRoot -Parent
$Backend = "$Repo\gateway_fisico\backend"
$Venv = "$Backend\.venv_gateway"

function Get-WorkingPython {
    $Candidates = @(
        @{ Exe = "py"; Args = @("-3.12") },
        @{ Exe = "py"; Args = @("-3.11") },
        @{ Exe = "py"; Args = @("-3") },
        @{ Exe = "python"; Args = @() },
        @{ Exe = "python3"; Args = @() }
    )

    foreach ($Candidate in $Candidates) {
        try {
            & $Candidate.Exe @($Candidate.Args + @("--version")) *> $null

            if ($LASTEXITCODE -eq 0) {
                return $Candidate
            }
        } catch {}
    }

    return $null
}

cd $Backend

$Python = Get-WorkingPython

if (-not $Python) {
    throw "Python funcional nao encontrado."
}

if (!(Test-Path "$Venv\Scripts\python.exe")) {
    & $Python.Exe @($Python.Args + @("-m", "venv", $Venv))
}

& "$Venv\Scripts\python.exe" -m pip install --upgrade pip
& "$Venv\Scripts\python.exe" -m pip install -r requirements.txt
& "$Venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8020 --reload