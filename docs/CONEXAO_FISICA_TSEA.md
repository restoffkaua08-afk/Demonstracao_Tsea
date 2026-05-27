CONEXAO FISICA TSEA V-TWIN

Arquitetura:

Sistema do Gerente
-> Gateway Python FastAPI
-> HTTP / Serial convertido / CLP convertido
-> ESP32, Arduino ou CLP
-> Sensor de pressao, bomba, lampada B2, oleo, farol e emergencia
-> IHM acompanha tudo via /api/state

Endpoints principais:

GET  /api/parameters
GET  /api/tanks
POST /api/tanks
GET  /api/hoses
POST /api/hoses
GET  /api/limits
POST /api/limits

GET  /api/hardware/schema
GET  /api/hardware/state
POST /api/hardware/mode
POST /api/hardware/ingest
POST /api/hardware/reset

POST /api/admin/clear-data

Payload esperado para /api/hardware/ingest:

{
  "status": "EM_CICLO",
  "stage": "VACUO_INICIAL",
  "elapsed_seconds": 12,
  "pressure_machine_mbar": 82.4,
  "pumps": {
    "b1": true,
    "b2": false,
    "oil": false
  },
  "oil": {
    "injected_l": 0,
    "remaining_l": 120,
    "flow_l_min": 0
  },
  "hardware": {
    "sensor_online": true,
    "plc_online": true,
    "emergency": false
  },
  "tanks": [
    {
      "id": "T1",
      "pressure_mbar": 83.6,
      "machine_pressure_mbar": 82.4,
      "hose_loss_mbar": 1.2,
      "oil_in_l": 0,
      "risk_pct": 18
    }
  ],
  "alarm": null
}