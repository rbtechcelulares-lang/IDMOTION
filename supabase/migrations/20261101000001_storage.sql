-- Bucket privado para vídeos, trilhas, frames, renders e narração (modo STORAGE=supabase).
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
