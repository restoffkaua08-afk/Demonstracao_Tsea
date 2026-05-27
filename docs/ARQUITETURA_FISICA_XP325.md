ARQUITETURA FISICA — TSEA V-TWIN COM XP325

Sistema gerente / IHM
↓
Gateway FastAPI
↓ Modbus TCP
PLC XP325 / In-Tech / InPi
↓
Sensor GHPC + emergencia + feedbacks + saidas

Equipamentos:
- Sensor GHPC SCD-020-01, -100 a +100 kPa, 12-24 VDC, OUT1 NPN, OUT2 PNP.
- Bomba duplo estagio ET140, 5 CFM, vacuo final 3x10^-1 Pa, 1/2 HP.
- Fonte Phoenix Contact UNO POWER 24V 60W.
- PLC XP325 com Modbus.

Tratamento do sensor:
- O GHPC sera usado inicialmente como sensor digital de limite.
- OUT1 e OUT2 nao fornecem grafico continuo de pressao.
- Se houver saida analogica futura, adicionar leitura numerica calibrada.

Tratamento da bomba:
- O PLC nao deve alimentar a bomba diretamente.
- Primeiro teste deve usar LED, lampada ou rele sem carga.
- Bomba real exige circuito de potencia, protecao e validacao com instrutor.

Modos:
- SIMULATED: sem PLC real.
- BANCADA_SEGURA: bancada com LED/rele sem carga.
- MODBUS_TCP: Gateway fala com XP325 por Modbus TCP.