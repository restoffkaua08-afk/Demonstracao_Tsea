Contrato HTTP para ESP32/PLC

GET /api/hardware/desired-outputs

{
  "allowed_to_run": true,
  "bench_safe": false,
  "physical_power_allowed": true,
  "outputs": {
    "pump_b1": true,
    "pump_b2": false,
    "oil_valve": false,
    "alarm_green": true,
    "alarm_yellow": false,
    "alarm_red": false,
    "emergency_stop": false
  }
}

POST /api/hardware/ingest

{
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
  ]
}

POST /api/hardware/command-ack

{
  "command_id": "CMD-000000",
  "applied": true,
  "message": "Comando aplicado pelo controlador."
}