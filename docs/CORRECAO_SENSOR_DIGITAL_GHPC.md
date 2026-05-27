CORRECAO DO SENSOR DIGITAL GHPC

O sensor GHPC SCD-020-01 foi tratado como pressostato/vacuostato digital.

Ele usa:
- OUT1 NPN;
- OUT2 PNP;
- faixa -100 a +100 kPa;
- alimentacao 12 a 24 VDC.

Como OUT1/OUT2 sao saidas digitais de limite, o sistema nao deve fingir pressao numerica continua.

Quando a pressao numerica estiver indisponivel:
- pressure_mbar = null;
- pressure_numeric_available = false;
- pressure_display = Indisponivel — sensor digital OUT1/OUT2.

O main.py agora aceita tanques com pressure_mbar nulo sem quebrar o payload.
O plc_modbus_bridge.py agora envia estado digital do sensor sem criar leitura falsa de pressao.