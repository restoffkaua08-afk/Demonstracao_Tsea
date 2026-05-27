# Estado final para iniciar integração física

## Pronto

- Gateway limpo sem receitas padrão ativas.
- Gateway limpo sem mangueiras demonstrativas ativas.
- Gerente cadastra receitas, tanques e mangueiras reais.
- IHM lê receitas, tanques e mangueiras reais.
- Gateway bloqueia operação sem dados reais cadastrados.
- Gateway expõe comandos desejados para ESP32/PLC.
- Gateway recebe telemetria física por HTTP.
- Watchdog bloqueia operação se o controlador parar de enviar dados.
- ESP32 possui exemplo com ArduinoJson.
- Scripts de teste existem para validar fluxo antes do hardware.

## Endpoints principais

- GET /api/real/parameters
- POST /api/real/recipes
- POST /api/real/tanks
- POST /api/real/hoses
- GET /api/hardware/desired-outputs
- POST /api/hardware/ingest
- POST /api/hardware/command-ack
- POST /api/hardware/mode
- GET /api/hardware/state

## Ordem de teste

1. Abrir tudo:
   scripts/abrir_tudo_demonstracao.ps1

2. Testar cadastro:
   scripts/testar_fluxo_real.ps1

3. Testar telemetria simulada:
   scripts/simular_hardware_http.ps1

4. Testar ESP32 sem carga:
   usar LEDs ou relés sem carga de potência.

5. Só depois estudar ligação com bomba real.