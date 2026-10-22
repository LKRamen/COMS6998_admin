-- Preserve safe server-controlled generation failure messages for recovery after navigation.
begin;
alter table public.generation_requests add column error_message text check(error_message is null or char_length(error_message)<=300);
commit;
