export type ProviderId =
  | "provider_public_portal_cnpj_cloudflare"
  | "provider_public_portal_cnd_cloudflare"
  | "provider_serpro_cnpj_placeholder"
  | "provider_serpro_cnd_placeholder";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  type: "cnpj" | "cnd";
  runtime: "cloudflare" | "serpro";
  enabled: boolean;
}

export const PROVIDERS: ProviderMeta[] = [
  { id: "provider_public_portal_cnpj_cloudflare", label: "Portal Receita (CNPJ) — Cloudflare", type: "cnpj", runtime: "cloudflare", enabled: true },
  { id: "provider_public_portal_cnd_cloudflare", label: "Portal Receita (CND) — Cloudflare", type: "cnd", runtime: "cloudflare", enabled: true },
  { id: "provider_serpro_cnpj_placeholder", label: "Serpro CNPJ (placeholder)", type: "cnpj", runtime: "serpro", enabled: false },
  { id: "provider_serpro_cnd_placeholder", label: "Serpro CND (placeholder)", type: "cnd", runtime: "serpro", enabled: false },
];