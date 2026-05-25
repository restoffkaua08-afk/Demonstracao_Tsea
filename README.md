# Demonstracao TSEA

Repositorio separado para a demonstracao real do projeto TSEA V-Twin.

Este repositorio sera usado para integrar:

- sistema do gerente;
- IHM do operador;
- gateway fisico em Python;
- prototipo fisico;
- scripts de execucao da demonstracao.

## Estrutura

sistema_gerente/
Sistema supervisorio do gerente/tecnico.

ihm_operador/
IHM local do operador.

gateway_fisico/
Backend Python que conectara IHM, sistema do gerente e prototipo fisico.

hardware_controller/
Arquivos futuros para ESP32, PLC ou controlador fisico.

docs/
Documentacao da arquitetura e integracao.

scripts/
Scripts para abrir e testar os sistemas.

## Arquitetura

Prototipo fisico
↓
Gateway Python
↓
IHM do operador
↓
Sistema do gerente

O React nao deve conversar diretamente com o hardware.
