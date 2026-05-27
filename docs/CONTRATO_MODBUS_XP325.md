CONTRATO MODBUS TCP — XP325

Gateway:
- Cliente Modbus TCP.
- Lê Discrete Inputs.
- Escreve Coils.

PLC XP325:
- Servidor/Slave Modbus TCP.
- IP inicial esperado no config/plc_map.json: 192.168.0.50.
- Porta: 502.
- Unit ID: 1.

Arquivos principais:
- gateway_fisico/backend/app/plc_modbus_bridge.py
- gateway_fisico/backend/config/plc_map.json
- gateway_fisico/backend/data/plc_runtime.json

Endpoints:
- GET  /api/plc/map
- POST /api/plc/config
- GET  /api/plc/status
- POST /api/plc/simulate-inputs
- POST /api/plc/sync-once
- POST /api/plc/force-safe

Ordem de teste:
1. Abrir Gateway.
2. Rodar scripts/ativar_plc_simulado.ps1.
3. Rodar scripts/testar_plc_simulado.ps1.
4. Conferir IHM e gerente.
5. Ajustar IP real do XP325.
6. Rodar scripts/testar_modbus_plc.ps1 -HostPlc "IP_DO_PLC".
7. Só depois ligar saídas físicas sem carga.