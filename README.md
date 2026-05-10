# Projeto 5

Backend de ingestao que sincroniza tips da Football Prediction API para o Supabase e deixa os dados prontos para consumo por outros aplicativos.

## Responsabilidade

- consumir `predictions?market=classic` da Football Prediction API
- normalizar o payload para a tabela `public.tips`
- registrar cada execucao em `public.sync_logs`
- disponibilizar uma fonte estavel para apps consumidores

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
   npm ci
   ```

2. Crie um arquivo `.env` usando `.env.example` como base.
3. Execute a sincronizacao:

   ```bash
   npm run sync:tips
   ```

4. Rode os testes automatizados:

   ```bash
   npm test
   ```

## Agendamento

O workflow do GitHub Actions roda `3x por dia` e tambem pode ser disparado manualmente.

Horarios configurados:
- `02:00` America/Sao_Paulo
- `12:00` America/Sao_Paulo
- `23:50` America/Sao_Paulo

Cron em UTC no workflow:
- `0 5,15 * * *`
- `50 2 * * *`

## Operacao

Fluxo do backend:
- GitHub Actions dispara o job
- o job chama a Football Prediction API
- o payload e convertido para linhas da tabela `tips`
- o job faz `upsert` por `fixture_id`
- a execucao e registrada em `sync_logs`

Consulta operacional util no Supabase:

```sql
select *
from public.sync_logs
order by requested_at desc
limit 20;
```

Consulta para validar o dado mais recente:

```sql
select *
from public.tips
order by updated_at desc
limit 20;
```

## Troubleshooting

Se o workflow falhar:
- confirme os secrets `RAPIDAPI_KEY`, `RAPIDAPI_HOST`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- confira os logs da ultima execucao no GitHub Actions
- valide o historico em `public.sync_logs`
- verifique se a cota mensal da API nao foi excedida

Erros esperados mais comuns:
- `Invalid API key`: chave do Supabase ou da RapidAPI incorreta
- `RapidAPI request timed out after 30 seconds`: timeout defensivo para evitar job travado
- `API response does not contain a valid data array`: mudanca de contrato ou resposta inesperada da API
