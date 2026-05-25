$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Repo = "$env:USERPROFILE\Demonstracao_Tsea"
$Backend = "$Repo\gateway_fisico\backend"

function Get-RealPython {
    $Candidates = @()

    if (Get-Command py -ErrorAction SilentlyContinue) {
        $Candidates += @{ Exe = "py"; Args = @("-3") }
    }

    if (Get-Command python -ErrorAction SilentlyContinue) {
        $Candidates += @{ Exe = "python"; Args = @() }
    }

    if (Get-Command python3 -ErrorAction SilentlyContinue) {
        $Candidates += @{ Exe = "python3"; Args = @() }
    }

    $PossiblePaths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:ProgramFiles\Python312\python.exe",
        "$env:ProgramFiles\Python311\python.exe",
        "${env:ProgramFiles(x86)}\Python312\python.exe",
        "${env:ProgramFiles(x86)}\Python311\python.exe"
    )

    foreach ($Path in $PossiblePaths) {
        if (Test-Path $Path) {
            $Candidates += @{ Exe = $Path; Args = @() }
        }
    }

    foreach ($Candidate in $Candidates) {
        try {
            $VersionArgs = @()
            $VersionArgs += $Candidate.Args
            $VersionArgs += @("--version")

            & $Candidate.Exe @VersionArgs *> $null

            if ($LASTEXITCODE -eq 0) {
                return $Candidate
            }
        } catch {}
    }

    return $null
}

cd $Backend

$Python = Get-RealPython

if (-not $Python) {
    throw "Python nao encontrado. Instale o Python 3.12 e marque Add Python to PATH."
}

if ((Test-Path ".\.venv") -and !(Test-Path ".\.venv\Scripts\python.exe")) {
    Remove-Item ".\.venv" -Recurse -Force
}

if (!(Test-Path ".\.venv")) {
    $VenvArgs = @()
    $VenvArgs += $Python.Args
    $VenvArgs += @("-m", "venv", ".venv")

    & $Python.Exe @VenvArgs
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8020 --reload