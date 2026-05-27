alter table public.integracoes_guias drop constraint if exists integracoes_guias_provider_check;
alter table public.integracoes_guias add constraint integracoes_guias_provider_check check (provider in ('google_drive','gmail','whatsapp_webjs','google_vision','pdf_native_reader'));

update public.integracoes_guias
set provider = 'whatsapp_webjs',
    display_name = 'WhatsApp WebJS'
where provider = 'twilio_whatsapp';

insert into public.integracoes_guias(provider, display_name)
values ('whatsapp_webjs','WhatsApp WebJS')
on conflict (provider) do update set display_name = excluded.display_name;
