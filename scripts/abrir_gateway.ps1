$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

$Repo = "$env:USERPROFILE\Demonstracao_Tsea"
$Backend = "$Repo\gateway_fisico\backend"

cd $Backend

if (!(Test-Path ".\.venv")) {
    python -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8020 --reload