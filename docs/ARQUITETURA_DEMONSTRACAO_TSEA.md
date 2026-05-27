# Arquitetura da Demonstração TSEA V-Twin

## Objetivo

Este repositório prepara a demonstração física do sistema TSEA V-Twin.

A arquitetura esperada é:

Sistema do gerente -> Gateway físico -> IHM do operador -> PLC/ESP32 -> sensores, bomba, atuadores e sinalização.

## Portas

- Gateway FastAPI: http://127.0.0.1:8020
- Sistema do gerente: http://127.0.0.1:5173
- IHM do operador: http://127.0.0.1:5178

## Dados reais

O gerente cadastra:

- receitas;
- tanques/reguladores;
- mangueiras.

A IHM lê esses dados pelo Gateway.

## Limites

Os limites técnicos ficam fixos no código, em `gateway_fisico/backend/app/real_bridge.py`.

O gerente não cadastra limites para evitar valores absurdos durante a operação.

## Fórmula da mangueira

V = π × (D² / 4) × L

D = diâmetro interno em metros  
L = comprimento em metros  
V = volume em m³, convertido para litros

## Pressão no tanque

P_tanque = P_sensor + ΔP_linha

A perda ΔP_linha deve ser calibrada em ensaio físico.