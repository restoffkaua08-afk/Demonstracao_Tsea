MAPA INICIAL DE I/O — PLC XP325 / IN-TECH / INPI

Este mapa é inicial e deve ser ajustado conforme o software da bancada.

ENTRADAS DIGITAIS MODBUS

DI0 / Discrete Input 0:
- Emergência física.
- true = emergência acionada.

DI1 / Discrete Input 1:
- Sensor GHPC OUT1 NPN.
- true = limite configurado no sensor atingido.

DI2 / Discrete Input 2:
- Sensor GHPC OUT2 PNP.
- true = segundo limite ou alarme configurado no sensor atingido.

DI3 / Discrete Input 3:
- Feedback B1.
- true = saída/relé/lâmpada da B1 ligada.

DI4 / Discrete Input 4:
- Feedback B2.
- true = saída/relé/lâmpada da B2 ligada.

DI5 / Discrete Input 5:
- Feedback óleo.
- true = saída/relé/lâmpada/válvula de óleo simulada ligada.

SAÍDAS DIGITAIS MODBUS

Coil 0:
- Comando B1.
- Em bancada segura usar LED ou relé sem carga.

Coil 1:
- Comando B2/lâmpada simulando Roots.
- Em bancada segura usar LED ou relé sem carga.

Coil 2:
- Comando óleo/válvula simulada.
- Em bancada segura usar LED ou relé sem carga.

Coil 3:
- Farol verde.

Coil 4:
- Farol amarelo.

Coil 5:
- Farol vermelho.

SENSOR GHPC SCD-020-01

Faixa:
- -100 a +100 kPa.

Alimentação:
- 12 a 24 VDC.

Saídas:
- OUT1 NPN.
- OUT2 PNP.

Tratamento no sistema:
- O sensor é tratado como pressostato/vacuostato digital.
- O sistema não deve fingir pressão contínua se não houver saída analógica.
- OUT1 e OUT2 são usados como estados de limite.