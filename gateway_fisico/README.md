# Gateway Fisico TSEA

Backend Python/FastAPI para conectar:

- IHM do operador
- Sistema do gerente
- Prototipo fisico
- Futuro PLC/controlador

## Rodar

powershell:
cd $env:USERPROFILE\Demonstracao_Tsea
.\scripts\abrir_gateway.ps1

## URLs

API:  http://127.0.0.1:8020
Docs: http://127.0.0.1:8020/docs
WS:   ws://127.0.0.1:8020/ws/live

## Rotas principais

GET  /api/state
GET  /api/recipes
GET  /api/hoses
GET  /api/history/today

POST /api/command/start
POST /api/command/pause
POST /api/command/resume
POST /api/command/stop
POST /api/command/emergency
POST /api/command/reset

POST /api/checklist/pre
POST /api/checklist/final

WS   /ws/live