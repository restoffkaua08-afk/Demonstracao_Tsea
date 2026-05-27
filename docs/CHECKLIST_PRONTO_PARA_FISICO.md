# Checklist antes de ligar hardware físico

1. Rodar scripts/abrir_tudo_demonstracao.ps1.
2. Acessar http://127.0.0.1:8020/api/real/parameters.
3. Confirmar receitas, tanques e mangueiras vazios.
4. Cadastrar receita no gerente.
5. Cadastrar tanque/regulador no gerente.
6. Cadastrar mangueira real no gerente.
7. Confirmar que a IHM recebeu a receita e a mangueira.
8. Rodar scripts/testar_fluxo_real.ps1.
9. Rodar scripts/simular_hardware_http.ps1.
10. Conferir GET /api/hardware/desired-outputs.
11. Só depois iniciar teste com ESP32/PLC real.