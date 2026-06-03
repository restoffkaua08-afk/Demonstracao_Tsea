# Google Planilhas com OAuth direto

## Resultado

No sistema do gerente:

1. Rastreabilidade
2. Indicadores e Gráficos
3. Escolha indicador, tipo e período
4. Clique em Entrar e gerar no Google Planilhas
5. O navegador abre a autorização do Google
6. Depois da autorização, o sistema cria uma nova planilha no seu Google Drive com dados reais e gráfico nativo editável

## Arquivo necessário

Baixe o OAuth Client do Google Cloud e salve exatamente como:

gateway_fisico/backend/data/google_oauth_client_secret.local.json

## Redirect URI obrigatório

No Google Cloud, o OAuth Client precisa aceitar este Redirect URI:

http://127.0.0.1:8020/api/google-oauth/callback

## APIs necessárias

Ative no Google Cloud:

- Google Sheets API
- Google Drive API

## Segurança

Não subir para o GitHub:

- google_oauth_client_secret.local.json
- google_oauth_token.local.json
- google_oauth_state.local.json
- google_sheets_generated.local.json