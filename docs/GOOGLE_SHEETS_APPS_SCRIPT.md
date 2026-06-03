# Integração TSEA V-Twin com Google Planilhas

## 1. Criar o Apps Script

1. Acesse Google Apps Script.
2. Crie um novo projeto.
3. Cole o conteúdo do arquivo `docs/google_sheets_apps_script.js`.
4. Salve o projeto.

## 2. Publicar como Web App

1. Clique em Implantar.
2. Escolha Nova implantação.
3. Tipo: Aplicativo da Web.
4. Executar como: você mesmo.
5. Quem tem acesso: qualquer pessoa com o link, ou configuração equivalente disponível na sua conta.
6. Copie a URL do Web App.

## 3. Configurar no TSEA V-Twin

1. Abra o Sistema do Gerente.
2. Vá em Rastreabilidade > Indicadores e Gráficos.
3. Cole a URL do Web App.
4. Clique em Salvar configuração.
5. Escolha indicador, tipo e período.
6. Clique em Gerar no Google Planilhas.

## 4. Segurança

Não subir URL privada, token, senha ou segredo para o GitHub.

O sistema salva a configuração localmente em:

`gateway_fisico/backend/data/google_sheets_config.local.json`

Esse arquivo deve permanecer fora do Git.