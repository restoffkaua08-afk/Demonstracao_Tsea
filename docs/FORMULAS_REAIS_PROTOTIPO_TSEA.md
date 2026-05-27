FORMULAS REAIS DO PROTOTIPO FISICO TSEA

1. Volume interno da mangueira

A mangueira nao tem uma "quantidade de vacuo". Ela tem volume interno.

V = pi * (D^2 / 4) * L

V = volume interno da mangueira em m3
D = diametro interno da mangueira em metros
L = comprimento da mangueira em metros

V_litros = V_m3 * 1000

2. Volume total evacuado

V_total = V_tanque + V_mangueira + V_conexoes

No prototipo inicial:
V_total aproximado = V_tanque + V_mangueira

3. Pressao medida na maquina versus pressao estimada no tanque

Se o sensor medir na maquina ou na bomba:

P_tanque = P_sensor + deltaP_linha

P_sensor = pressao real medida pelo sensor
deltaP_linha = perda estimada/calibrada da mangueira e conexoes

4. Perda de pressao real

A perda real depende de:
- comprimento da mangueira
- diametro interno
- vazao da bomba
- regime de escoamento
- curvas e conexoes
- rugosidade interna
- pressao instantanea
- temperatura

Nesta fase o sistema salva:
- comprimento real da mangueira
- diametro interno real
- volume interno calculado
- perda calibrada em mbar

5. Velocidade efetiva de bombeamento

Quando houver dados reais da bomba:

1 / S_efetivo = 1 / S_bomba + 1 / C_mangueira

S_efetivo = velocidade efetiva de bombeamento no tanque
S_bomba = velocidade nominal ou real da bomba
C_mangueira = condutancia da mangueira

6. Curva simplificada de queda de pressao

P(t) = P_final + (P_inicial - P_final) * e^(-(S_efetivo / V_total) * t)

Esse modelo so deve ser usado quando houver:
- volume real do tanque
- volume real da mangueira
- desempenho real da bomba
- pressao medida durante o ciclo