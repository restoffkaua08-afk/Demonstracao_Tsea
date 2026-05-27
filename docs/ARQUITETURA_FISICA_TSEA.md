# Arquitetura física TSEA V-Twin

## Camadas

1. Sistema do gerente
2. Gateway físico FastAPI
3. IHM do operador
4. ESP32/PLC
5. Sensor de pressão, bomba, atuadores e sinalização

## Fluxo de dados

Gerente -> Gateway:
- cadastra receitas;
- cadastra tanques;
- cadastra mangueiras.

IHM -> Gateway:
- inicia operação;
- pausa/finaliza;
- acompanha estado em tempo real.

ESP32/PLC -> Gateway:
- envia pressão real;
- envia estado de bombas;
- envia emergência;
- envia status de sensor e comunicação;
- envia dados dos tanques.

Gateway -> ESP32/PLC:
- informa saídas desejadas:
  - pump_b1;
  - pump_b2;
  - oil_valve;
  - alarm_green;
  - alarm_yellow;
  - alarm_red;
  - emergency_stop.

## Endpoints físicos

GET  /api/hardware/schema
GET  /api/hardware/desired-outputs
POST /api/hardware/command-ack
POST /api/hardware/ingest
POST /api/hardware/mode
POST /api/hardware/reset

## Watchdog

Se o Gateway estiver em modo FISICO_HTTP e ficar mais de 5 segundos sem receber POST /api/hardware/ingest, ele:
- marca PLC offline;
- bloqueia operação;
- desliga bombas;
- aciona saída de emergência/alarme vermelho.