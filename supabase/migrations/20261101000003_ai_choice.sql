-- Cérebro criativo escolhido por projeto: auto | gemini | opus | haiku | rules
alter table projects add column if not exists ai text not null default 'auto';
