# Guia de manutencao — Demonstracao TSEA V-Twin

gateway_fisico/backend/app/main.py:
- nucleo FastAPI;
- estado da operacao;
- rastreabilidade;
- comandos da IHM;
- sem receitas, tanques ou mangueiras fixas.

gateway_fisico/backend/app/real_bridge.py:
- ponte fisica;
- watchdog;
- modo bancada segura;
- endpoints ESP32/PLC;
- comandos desejados;
- leituras reais.

sistema_gerente/frontend/src/pages/ParametersPage.tsx:
- cadastro de receitas, tanques e mangueiras reais.

ihm_operador/frontend/src/main.tsx:
- fluxo operacional da IHM.

hardware/esp32_http_bridge/esp32_http_bridge.ino:
- exemplo de ponte ESP32 por HTTP.

Regra:
A operacao e iniciada pela IHM/Gateway. O ESP32/PLC apenas executa comandos, envia leituras reais e confirma aplicacao.