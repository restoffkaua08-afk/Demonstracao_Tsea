# ESP32 HTTP Bridge - TSEA V-Twin

## Objetivo

Este código conecta um ESP32 ao Gateway físico da demonstração.

Fluxo:

1. ESP32 consulta comandos:
   - GET /api/hardware/desired-outputs

2. ESP32 aplica saídas:
   - B1
   - B2
   - linha/válvula de óleo
   - farol verde
   - farol amarelo
   - farol vermelho

3. ESP32 envia leituras:
   - POST /api/hardware/ingest

4. ESP32 confirma comando:
   - POST /api/hardware/command-ack

## Biblioteca necessária

Instale no Arduino IDE:

- ArduinoJson

## Segurança de bancada

Comece com LEDs ou relés sem carga perigosa.

Não ligue bomba real, rede elétrica, solenoide de força ou carga de potência sem validação do instrutor e proteção elétrica adequada.

## Ajustes obrigatórios antes do sensor real

No arquivo `.ino`, substituir a função `readPressureMbar()` pela curva real do sensor usado.