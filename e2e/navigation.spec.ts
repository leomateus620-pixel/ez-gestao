import { expect, test, type Page } from '@playwright/test';

const projectRef = 'wsgphutkybxhajyicxif';
const authStorageKey = `sb-${projectRef}-auth-token`;
const now = '2026-06-05T12:00:00.000Z';

const session = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 2_091_845_036,
  user: {
    id: 'e2e-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@ezgestao.test',
    app_metadata: {},
    user_metadata: {},
  },
};

const rowsByTable: Record<string, unknown[]> = {
  empresas: [{
    id: 'empresa-1',
    razao_social: 'Acme Servicos LTDA',
    nome_fantasia: 'Acme',
    cnpj: '11222333000181',
    regime_tributario: 'simples_nacional',
    municipio: 'Sao Paulo',
    estado: 'SP',
    responsavel_interno: 'Admin',
    responsavel_cliente: 'Maria',
    email_principal: 'financeiro@acme.test',
    whatsapp_principal: '11999999999',
    canal_preferido: 'email',
    email_validado: true,
    whatsapp_opt_in_at: null,
    comunicacao_ativa: true,
    saudacao_guia: 'Ola',
    observacoes: '',
    status: 'ativa',
    created_at: now,
    updated_at: now,
  }],
  documentos: [{
    id: 'doc-1',
    empresa_id: 'empresa-1',
    nome: 'guia-acme.pdf',
    categoria: 'guia',
    data_upload: '2026-06-01',
    responsavel: 'Admin',
    validade: null,
    observacao: '',
    versao: 1,
    tamanho: '20 KB',
    storage_path: '#',
    created_at: now,
  }],
  envios: [{
    id: 'envio-1',
    empresa_id: 'empresa-1',
    canal: 'email',
    destinatario: 'financeiro@acme.test',
    assunto: 'Guia DAS',
    mensagem: 'Segue guia.',
    documento_ids: ['doc-1'],
    status: 'enviado',
    data_envio: now,
    usuario: 'Admin',
    created_at: now,
  }],
  alertas: [{
    id: 'alerta-1',
    empresa_id: 'empresa-1',
    tipo: 'operacional',
    prioridade: 'alta',
    titulo: 'Guia pendente',
    descricao: 'Revisar envio de guia.',
    lido: false,
    resolvido: false,
    snoozed_ate: null,
    created_at: now,
  }],
  logs_acesso: [],
  audit_trail: [],
  guias: [{
    id: 'guia-1',
    drive_file_id: 'drive-1',
    file_name: 'DAS Acme.pdf',
    mime_type: 'application/pdf',
    sha256: 'abc',
    status: 'aguardando',
    match_source: 'filename',
    cnpj_detectado: '11222333000181',
    empresa_id: 'empresa-1',
    tipo_guia: 'DAS',
    competencia: '05/2026',
    vencimento: '2026-06-20',
    valor: 250,
    texto_extraido_preview: 'DAS',
    pagina_count: 1,
    extraction_method: 'native',
    has_text_layer: true,
    pasta_atual: 'a_enviar',
    provider_error: null,
    received_at: now,
    processed_at: null,
    sent_at: null,
  }],
  guia_envios: [],
  guia_excecoes: [],
  guia_eventos: [],
  integracoes_guias: [{
    provider: 'google_drive',
    display_name: 'Google Drive',
    status: 'ativo',
    source_folder_id: 'a-enviar',
    sent_folder_id: 'enviados',
    sender_identity: 'admin@ezgestao.test',
    schedule_minutes: 5,
    last_check_at: now,
    last_error: null,
  }],
  fator_r_companies: [],
  fator_r_monthly_results: [],
  fator_r_processing_logs: [],
  fator_r_sync_config: [],
  fator_r_drive_folders: [],
  fator_r_documents: [],
  classifica_documents: [],
  classifica_invoice_items: [],
  classifica_rules: [],
  classifica_review_queue: [],
  classifica_processing_logs: [],
  whatsapp_messages: [],
};

async function mockSupabase(page: Page) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: authStorageKey, value: session });

  await page.route('**/auth/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: session.user, session }),
    });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/rest/v1/')[1]?.split('/')[0] ?? '';
    const accept = request.headers().accept ?? '';

    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' } });
      return;
    }

    if (accept.includes('vnd.pgrst.object')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rowsByTable[table]?.[0] ?? null),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rowsByTable[table] ?? []),
    });
  });

  await page.route('**/functions/v1/**', async (route) => {
    const fn = new URL(route.request().url()).pathname.split('/functions/v1/')[1] ?? '';
    const body = fn.startsWith('integracoes-status')
      ? { google_drive: true, gmail: true, twilio_whatsapp: false, pdf_native_reader: true }
      : fn.startsWith('run-guide-scan-now')
        ? { scanned: 0 }
        : { ok: true };

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page);
});

test('navega pelos menus principais, submenus e refresh de rota interna', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Envio de Guias/i })).toBeVisible();

  const menuItems = [
    { label: 'Abrir dashboard', path: '/', heading: /Envio de Guias/i },
    { label: 'Abrir modulo de guias', path: '/guias', heading: /Fila de Guias/i },
    { label: 'Abrir empresas', path: '/empresas', heading: /Empresas/i },
    { label: 'Abrir integracoes', path: '/integracoes', heading: /Integra/i },
    { label: 'Abrir modulo Fator R', path: '/fator-r', heading: /Fator R/i },
    { label: 'Abrir modulo Classifica', path: '/classifica', heading: /Classifica/i },
    { label: 'Abrir envios', path: '/envios', heading: /Envios/i },
    { label: 'Abrir alertas', path: '/alertas', heading: /Alertas/i },
    { label: 'Abrir modulo WhatsApp', path: '/whatsapp', heading: /WhatsApp/i },
    { label: 'Abrir configuracoes', path: '/configuracoes', heading: /Configura/i },
  ];

  for (const item of menuItems) {
    const button = page.getByLabel(item.label);
    await expect(button).toHaveCount(1);
    await button.click();
    await expect(page).toHaveURL(item.path);
    await expect(page.getByRole('heading', { name: item.heading })).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }

  await page.getByLabel('Abrir modulo de guias').hover();
  await page.getByRole('button', { name: 'Enviadas' }).click();
  await expect(page).toHaveURL('/guias/enviadas');
  await expect(page.getByRole('heading', { name: /Guias Enviadas/i })).toBeVisible();
  await expect(page.getByLabel('Abrir modulo de guias')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('heading', { name: /Guias Enviadas/i })).toBeVisible();
  await expect(page.getByLabel('Abrir modulo de guias')).toHaveAttribute('aria-pressed', 'true');

  expect(consoleErrors).toEqual([]);
});

test('mantem navegacao utilizavel em viewport mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/envios');

  await expect(page.getByRole('heading', { name: /Envios/i })).toBeVisible();
  await expect(page.getByLabel('Abrir envios')).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Busca global').click();
  await expect(page.getByPlaceholder(/Buscar em dashboard, guias, empresas/i)).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});
