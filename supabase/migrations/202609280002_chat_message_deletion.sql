-- Retain only an empty tombstone for idempotent send retries and Realtime invalidation.
alter table public.chat_messages add column deleted_at timestamptz;
create index chat_messages_visible_cursor_idx on public.chat_messages(created_at desc,id desc)
  where deleted_at is null;

create function public.delete_message(p_message_id uuid) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_member(); upload_ids uuid[];
begin
  perform 1 from public.chat_messages where id=p_message_id and user_id=member_id for update;
  if not found then
    raise exception 'You can only delete your own messages' using errcode = '42501';
  end if;
  select coalesce(array_agg(id),'{}'::uuid[]) into upload_ids
    from public.chat_attachments where message_id=p_message_id;
  perform 1 from public.upload_objects where id=any(upload_ids) order by id for update;
  delete from public.chat_attachments where message_id=p_message_id;
  update public.upload_objects set state='deleting',touched_at=now() where id=any(upload_ids);
  update public.chat_messages set message_text=null,deleted_at=coalesce(deleted_at,now())
    where id=p_message_id;
  return upload_ids;
end $$;
revoke all on function public.delete_message(uuid) from public,anon,authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
