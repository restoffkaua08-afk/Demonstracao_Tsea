# Gateway Fisico TSEA

Este backend sera responsavel por conectar:

- IHM do operador;
- sistema do gerente;
- prototipo fisico;
- futuro PLC/controlador.

## Rotas previstas

GET  /api/state
GET  /api/recipes
GET  /api/history/today

POST /api/command/start
POST /api/command/pause
POST /api/command/stop
POST /api/command/emergency

POST /api/checklist/pre
POST /api/checklist/final

WS   /ws/live
