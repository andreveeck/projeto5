# Projeto 5

Sincroniza tips da Football Prediction API para o Supabase e deixa os dados prontos para consumo do app.

## Requisitos

- Node.js 20+
- Tabelas `public.tips` e `public.sync_logs` criadas no Supabase
- Secrets configurados:
  - `RAPIDAPI_KEY`
  - `RAPIDAPI_HOST`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Rodar localmente

1. Instale as dependencias:

   ```bash
   npm install
   ```

2. Crie um arquivo `.env` usando `.env.example` como base.
3. Execute a sincronizacao:

   ```bash
   npm run sync:tips
   ```

## Agendamento

O workflow do GitHub Actions roda `3x por dia` e tambem pode ser disparado manualmente.
