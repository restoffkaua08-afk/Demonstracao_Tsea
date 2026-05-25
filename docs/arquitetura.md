# Arquitetura da Demonstracao TSEA

## Visao geral

[Prototipo fisico]
sensor de pressao/vacuo
mini bomba
lampada simulando B2/Roots
farol opcional
controlador fisico
        ↓
[Gateway fisico Python]
FastAPI
WebSocket
REST API
modo simulado
modo fisico futuro
        ↓
[IHM do operador]
React
preparo da operacao
checklist
operacao em tempo real
finalizacao
        ↓
[Sistema do gerente]
supervisorio
rastreabilidade
historico
graficos
Gemeo Digital

## Ordem de implementacao

1. Criar gateway fisico simulado.
2. Fazer IHM consumir o gateway.
3. Fazer sistema do gerente consumir o gateway.
4. Criar historico local.
5. Criar modo fisico.
6. Conectar sensor real.
7. Conectar bomba/lampada.
8. Testar fluxo completo.
