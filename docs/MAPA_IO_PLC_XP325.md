MAPA INICIAL DE I/O — PLC XP325 / IN-TECH / INPI

ENTRADAS DIGITAIS MODBUS

DI0 / Discrete Input 0:
- Emergencia fisica.
- true = emergencia acionada.

DI1 / Discrete Input 1:
- Sensor GHPC OUT1 NPN.
- true = limite configurado no sensor atingido.

DI2 / Discrete Input 2:
- Sensor GHPC OUT2 PNP.
- true = segundo limite ou alarme configurado no sensor atingido.

DI3 / Discrete Input 3:
- Feedback B1.
- true = saida/rele/lampada da B1 ligada.

DI4 / Discrete Input 4:
- Feedback B2.
- true = saida/rele/lampada da B2 ligada.

DI5 / Discrete Input 5:
- Feedback oleo.
- true = saida/rele/lampada/valvula de oleo simulada ligada.

SAIDAS DIGITAIS MODBUS

Coil 0:
- Comando B1.
- Em bancada segura usar LED ou rele sem carga.

Coil 1:
- Comando B2/lampada simulando Roots.
- Em bancada segura usar LED ou rele sem carga.

Coil 2:
- Comando oleo/valvula simulada.
- Em bancada segura usar LED ou rele sem carga.

Coil 3:
- Farol verde.

Coil 4:
- Farol amarelo.

Coil 5:
- Farol vermelho.