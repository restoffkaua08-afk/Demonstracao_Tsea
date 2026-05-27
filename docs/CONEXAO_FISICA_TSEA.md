CONEXAO FISICA TSEA V-TWIN

Arquitetura:

Sistema do Gerente
-> Gateway Python FastAPI
-> HTTP / Serial convertido / CLP convertido
-> ESP32, Arduino ou CLP
-> Sensor de pressao, bomba, lampada B2, oleo, farol e emergencia
-> IHM acompanha tudo via /api/state

Endpoints principais:

GET  /api/real/parameters
GET  /api/real/recipes
POST /api/real/recipes
DELETE /api/real/recipes/{recipe_id}

GET  /api/real/tanks
POST /api/real/tanks
DELETE /api/real/tanks/{tank_id}

GET  /api/real/hoses
POST /api/real/hoses
DELETE /api/real/hoses/{hose_id}

GET  /api/real/limits
POST /api/real/limits

GET  /api/hardware/schema
GET  /api/hardware/state
POST /api/hardware/mode
POST /api/hardware/ingest
POST /api/hardware/reset

POST /api/real/admin/clear-data