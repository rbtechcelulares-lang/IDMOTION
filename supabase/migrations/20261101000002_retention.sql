-- Retenção: arquivos de vídeo são apagados após RETENTION_DAYS (padrão 2) sem atividade.
alter table projects add column if not exists files_deleted_at timestamptz;
