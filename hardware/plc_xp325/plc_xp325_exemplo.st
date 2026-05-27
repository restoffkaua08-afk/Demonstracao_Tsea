(*
Programa exemplo em Structured Text para PLC XP325/In-Tech/InPi.

Este código é genérico IEC 61131-3.
Ajuste nomes das variáveis e endereços conforme o software real da bancada.

Regra:
- O Gateway manda comandos desejados via Modbus.
- O PLC aplica saídas somente se não houver emergência.
- O PLC devolve estados físicos por entradas/feedbacks.
*)

VAR
    DI_Emergencia       : BOOL;
    DI_GHPC_OUT1_NPN    : BOOL;
    DI_GHPC_OUT2_PNP    : BOOL;
    DI_Feedback_B1      : BOOL;
    DI_Feedback_B2      : BOOL;
    DI_Feedback_Oleo    : BOOL;

    CMD_B1              : BOOL;
    CMD_B2              : BOOL;
    CMD_Oleo            : BOOL;
    CMD_Farol_Verde     : BOOL;
    CMD_Farol_Amarelo   : BOOL;
    CMD_Farol_Vermelho  : BOOL;

    DO_B1               : BOOL;
    DO_B2               : BOOL;
    DO_Oleo             : BOOL;
    DO_Farol_Verde      : BOOL;
    DO_Farol_Amarelo    : BOOL;
    DO_Farol_Vermelho   : BOOL;

    SYS_Bloqueado       : BOOL;
END_VAR

SYS_Bloqueado := DI_Emergencia OR DI_GHPC_OUT2_PNP;

IF SYS_Bloqueado THEN
    DO_B1 := FALSE;
    DO_B2 := FALSE;
    DO_Oleo := FALSE;
    DO_Farol_Verde := FALSE;
    DO_Farol_Amarelo := FALSE;
    DO_Farol_Vermelho := TRUE;
ELSE
    DO_B1 := CMD_B1;
    DO_B2 := CMD_B2;
    DO_Oleo := CMD_Oleo;
    DO_Farol_Verde := CMD_Farol_Verde;
    DO_Farol_Amarelo := CMD_Farol_Amarelo OR DI_GHPC_OUT1_NPN;
    DO_Farol_Vermelho := CMD_Farol_Vermelho;
END_IF;