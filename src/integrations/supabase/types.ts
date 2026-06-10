export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          cnd_item_id: string | null
          created_at: string
          descricao: string
          empresa_id: string
          id: string
          lido: boolean
          prioridade: Database["public"]["Enums"]["alerta_prioridade"]
          resolvido: boolean
          snoozed_ate: string | null
          tipo: Database["public"]["Enums"]["alerta_tipo"]
          titulo: string
        }
        Insert: {
          cnd_item_id?: string | null
          created_at?: string
          descricao?: string
          empresa_id: string
          id?: string
          lido?: boolean
          prioridade?: Database["public"]["Enums"]["alerta_prioridade"]
          resolvido?: boolean
          snoozed_ate?: string | null
          tipo: Database["public"]["Enums"]["alerta_tipo"]
          titulo: string
        }
        Update: {
          cnd_item_id?: string | null
          created_at?: string
          descricao?: string
          empresa_id?: string
          id?: string
          lido?: boolean
          prioridade?: Database["public"]["Enums"]["alerta_prioridade"]
          resolvido?: boolean
          snoozed_ate?: string | null
          tipo?: Database["public"]["Enums"]["alerta_tipo"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_cnd_item_id_fkey"
            columns: ["cnd_item_id"]
            isOneToOne: false
            referencedRelation: "cnd_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_trail: {
        Row: {
          action: string
          details: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          timestamp: string
          user_id: string
        }
        Insert: {
          action: string
          details?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          timestamp?: string
          user_id?: string
        }
        Update: {
          action?: string
          details?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      automation_artifacts: {
        Row: {
          artifact_type: Database["public"]["Enums"]["artifact_type"]
          created_at: string
          file_path: string
          file_size: number
          id: string
          job_id: string
          metadata_json: Json
          mime_type: string
          sha256: string | null
        }
        Insert: {
          artifact_type: Database["public"]["Enums"]["artifact_type"]
          created_at?: string
          file_path: string
          file_size?: number
          id?: string
          job_id: string
          metadata_json?: Json
          mime_type?: string
          sha256?: string | null
        }
        Update: {
          artifact_type?: Database["public"]["Enums"]["artifact_type"]
          created_at?: string
          file_path?: string
          file_size?: number
          id?: string
          job_id?: string
          metadata_json?: Json
          mime_type?: string
          sha256?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_batches: {
        Row: {
          agendado_para: string
          created_at: string
          empresa_ids: string[]
          id: string
          progresso_atual: number
          status: Database["public"]["Enums"]["batch_status"]
          total_items: number
        }
        Insert: {
          agendado_para: string
          created_at?: string
          empresa_ids?: string[]
          id?: string
          progresso_atual?: number
          status?: Database["public"]["Enums"]["batch_status"]
          total_items?: number
        }
        Update: {
          agendado_para?: string
          created_at?: string
          empresa_ids?: string[]
          id?: string
          progresso_atual?: number
          status?: Database["public"]["Enums"]["batch_status"]
          total_items?: number
        }
        Relationships: []
      }
      automation_config: {
        Row: {
          circuit_breaker_limiar: number
          confianca_minima: Database["public"]["Enums"]["confidence_level"]
          id: string
          max_concorrencia_por_conector: number
          timeout_global_lote: number
          updated_at: string
        }
        Insert: {
          circuit_breaker_limiar?: number
          confianca_minima?: Database["public"]["Enums"]["confidence_level"]
          id?: string
          max_concorrencia_por_conector?: number
          timeout_global_lote?: number
          updated_at?: string
        }
        Update: {
          circuit_breaker_limiar?: number
          confianca_minima?: Database["public"]["Enums"]["confidence_level"]
          id?: string
          max_concorrencia_por_conector?: number
          timeout_global_lote?: number
          updated_at?: string
        }
        Relationships: []
      }
      automation_config_kv: {
        Row: {
          description: string
          key: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          description?: string
          key: string
          updated_at?: string
          value_json?: Json
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: []
      }
      automation_exceptions: {
        Row: {
          created_at: string
          description: string
          exception_type: string
          id: string
          job_id: string | null
          last_seen_at: string
          resolution_notes: string
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["exception_severity"]
          status: Database["public"]["Enums"]["exception_lifecycle"]
          technical_details_json: Json
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          exception_type: string
          id?: string
          job_id?: string | null
          last_seen_at?: string
          resolution_notes?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["exception_severity"]
          status?: Database["public"]["Enums"]["exception_lifecycle"]
          technical_details_json?: Json
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          exception_type?: string
          id?: string
          job_id?: string | null
          last_seen_at?: string
          resolution_notes?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["exception_severity"]
          status?: Database["public"]["Enums"]["exception_lifecycle"]
          technical_details_json?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_exceptions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_job_logs: {
        Row: {
          created_at: string
          details_json: Json
          id: string
          job_id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          step: string
        }
        Insert: {
          created_at?: string
          details_json?: Json
          id?: string
          job_id: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          step?: string
        }
        Update: {
          created_at?: string
          details_json?: Json
          id?: string
          job_id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_job_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_jobs: {
        Row: {
          attempts: number
          correlation_id: string
          created_at: string
          dispatched_at: string | null
          error_message: string | null
          error_type: string | null
          finished_at: string | null
          id: string
          job_type: Database["public"]["Enums"]["job_type"]
          locked_by: string | null
          max_attempts: number
          metadata_json: Json
          next_run_at: string
          priority: number
          provider: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          target_request_id: string | null
          timeout_ms: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          correlation_id: string
          created_at?: string
          dispatched_at?: string | null
          error_message?: string | null
          error_type?: string | null
          finished_at?: string | null
          id?: string
          job_type: Database["public"]["Enums"]["job_type"]
          locked_by?: string | null
          max_attempts?: number
          metadata_json?: Json
          next_run_at?: string
          priority?: number
          provider: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          target_request_id?: string | null
          timeout_ms?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          correlation_id?: string
          created_at?: string
          dispatched_at?: string | null
          error_message?: string | null
          error_type?: string | null
          finished_at?: string | null
          id?: string
          job_type?: Database["public"]["Enums"]["job_type"]
          locked_by?: string | null
          max_attempts?: number
          metadata_json?: Json
          next_run_at?: string
          priority?: number
          provider?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          target_request_id?: string | null
          timeout_ms?: number
          updated_at?: string
        }
        Relationships: []
      }
      cnd_historico: {
        Row: {
          acao: string
          cnd_item_id: string
          data: string
          detalhes: string
          id: string
          usuario: string
        }
        Insert: {
          acao: string
          cnd_item_id: string
          data?: string
          detalhes?: string
          id?: string
          usuario?: string
        }
        Update: {
          acao?: string
          cnd_item_id?: string
          data?: string
          detalhes?: string
          id?: string
          usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "cnd_historico_cnd_item_id_fkey"
            columns: ["cnd_item_id"]
            isOneToOne: false
            referencedRelation: "cnd_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cnd_items: {
        Row: {
          arquivo_id: string | null
          created_at: string
          data_emissao: string | null
          data_vencimento: string | null
          empresa_id: string
          id: string
          observacao: string
          origem: string
          responsavel: string
          status: Database["public"]["Enums"]["cnd_status"]
          tipo: Database["public"]["Enums"]["cnd_tipo"]
          updated_at: string
        }
        Insert: {
          arquivo_id?: string | null
          created_at?: string
          data_emissao?: string | null
          data_vencimento?: string | null
          empresa_id: string
          id?: string
          observacao?: string
          origem?: string
          responsavel?: string
          status?: Database["public"]["Enums"]["cnd_status"]
          tipo: Database["public"]["Enums"]["cnd_tipo"]
          updated_at?: string
        }
        Update: {
          arquivo_id?: string | null
          created_at?: string
          data_emissao?: string | null
          data_vencimento?: string | null
          empresa_id?: string
          id?: string
          observacao?: string
          origem?: string
          responsavel?: string
          status?: Database["public"]["Enums"]["cnd_status"]
          tipo?: Database["public"]["Enums"]["cnd_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cnd_items_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cnd_lookup_requests: {
        Row: {
          cache_hit: boolean
          cnpj_normalized: string
          correlation_id: string | null
          created_at: string
          finished_at: string | null
          force_refresh: boolean
          from_cache: boolean
          id: string
          latest_job_id: string | null
          linked_company_request_id: string | null
          notes: string
          requested_by: string
          source_provider: string
          started_at: string | null
          status: Database["public"]["Enums"]["lookup_status"]
        }
        Insert: {
          cache_hit?: boolean
          cnpj_normalized: string
          correlation_id?: string | null
          created_at?: string
          finished_at?: string | null
          force_refresh?: boolean
          from_cache?: boolean
          id?: string
          latest_job_id?: string | null
          linked_company_request_id?: string | null
          notes?: string
          requested_by?: string
          source_provider?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["lookup_status"]
        }
        Update: {
          cache_hit?: boolean
          cnpj_normalized?: string
          correlation_id?: string | null
          created_at?: string
          finished_at?: string | null
          force_refresh?: boolean
          from_cache?: boolean
          id?: string
          latest_job_id?: string | null
          linked_company_request_id?: string | null
          notes?: string
          requested_by?: string
          source_provider?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["lookup_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cnd_lookup_requests_linked_company_request_id_fkey"
            columns: ["linked_company_request_id"]
            isOneToOne: false
            referencedRelation: "company_lookup_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      cnd_lookup_results: {
        Row: {
          cache_valid_until: string | null
          certificate_number: string | null
          cnd_status: Database["public"]["Enums"]["cnd_lookup_status"]
          consulted_at: string
          id: string
          issued_at: string | null
          parsed_payload_json: Json
          pdf_path: string | null
          pdf_sha256: string | null
          raw_payload_json: Json
          request_id: string
          source_url: string | null
          valid_until: string | null
        }
        Insert: {
          cache_valid_until?: string | null
          certificate_number?: string | null
          cnd_status: Database["public"]["Enums"]["cnd_lookup_status"]
          consulted_at?: string
          id?: string
          issued_at?: string | null
          parsed_payload_json?: Json
          pdf_path?: string | null
          pdf_sha256?: string | null
          raw_payload_json?: Json
          request_id: string
          source_url?: string | null
          valid_until?: string | null
        }
        Update: {
          cache_valid_until?: string | null
          certificate_number?: string | null
          cnd_status?: Database["public"]["Enums"]["cnd_lookup_status"]
          consulted_at?: string
          id?: string
          issued_at?: string | null
          parsed_payload_json?: Json
          pdf_path?: string | null
          pdf_sha256?: string | null
          raw_payload_json?: Json
          request_id?: string
          source_url?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cnd_lookup_results_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "cnd_lookup_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      company_lookup_requests: {
        Row: {
          cache_hit: boolean
          cnpj_input: string
          cnpj_normalized: string
          correlation_id: string | null
          created_at: string
          finished_at: string | null
          force_refresh: boolean
          from_cache: boolean
          id: string
          latest_job_id: string | null
          notes: string
          requested_by: string
          source_provider: string
          started_at: string | null
          status: Database["public"]["Enums"]["lookup_status"]
        }
        Insert: {
          cache_hit?: boolean
          cnpj_input: string
          cnpj_normalized: string
          correlation_id?: string | null
          created_at?: string
          finished_at?: string | null
          force_refresh?: boolean
          from_cache?: boolean
          id?: string
          latest_job_id?: string | null
          notes?: string
          requested_by?: string
          source_provider?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["lookup_status"]
        }
        Update: {
          cache_hit?: boolean
          cnpj_input?: string
          cnpj_normalized?: string
          correlation_id?: string | null
          created_at?: string
          finished_at?: string | null
          force_refresh?: boolean
          from_cache?: boolean
          id?: string
          latest_job_id?: string | null
          notes?: string
          requested_by?: string
          source_provider?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["lookup_status"]
        }
        Relationships: []
      }
      company_lookup_results: {
        Row: {
          address_json: Json
          cache_valid_until: string
          consulted_at: string
          id: string
          legal_nature: string | null
          main_cnae: string | null
          official_name: string | null
          opening_date: string | null
          parsed_confidence: number
          parsed_payload_json: Json
          qsa_json: Json
          raw_payload_json: Json
          registration_status: string | null
          request_id: string
          secondary_cnaes_json: Json
          source_url: string | null
          trade_name: string | null
        }
        Insert: {
          address_json?: Json
          cache_valid_until?: string
          consulted_at?: string
          id?: string
          legal_nature?: string | null
          main_cnae?: string | null
          official_name?: string | null
          opening_date?: string | null
          parsed_confidence?: number
          parsed_payload_json?: Json
          qsa_json?: Json
          raw_payload_json?: Json
          registration_status?: string | null
          request_id: string
          secondary_cnaes_json?: Json
          source_url?: string | null
          trade_name?: string | null
        }
        Update: {
          address_json?: Json
          cache_valid_until?: string
          consulted_at?: string
          id?: string
          legal_nature?: string | null
          main_cnae?: string | null
          official_name?: string | null
          opening_date?: string | null
          parsed_confidence?: number
          parsed_payload_json?: Json
          qsa_json?: Json
          raw_payload_json?: Json
          registration_status?: string | null
          request_id?: string
          secondary_cnaes_json?: Json
          source_url?: string | null
          trade_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_lookup_results_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "company_lookup_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_run_steps: {
        Row: {
          detalhes: string
          etapa: Database["public"]["Enums"]["run_step_etapa"]
          fim: string | null
          id: string
          inicio: string
          run_id: string
          status: Database["public"]["Enums"]["run_step_status"]
        }
        Insert: {
          detalhes?: string
          etapa: Database["public"]["Enums"]["run_step_etapa"]
          fim?: string | null
          id?: string
          inicio?: string
          run_id: string
          status?: Database["public"]["Enums"]["run_step_status"]
        }
        Update: {
          detalhes?: string
          etapa?: Database["public"]["Enums"]["run_step_etapa"]
          fim?: string | null
          id?: string
          inicio?: string
          run_id?: string
          status?: Database["public"]["Enums"]["run_step_status"]
        }
        Relationships: [
          {
            foreignKeyName: "connector_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "connector_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_runs: {
        Row: {
          cnd_item_id: string | null
          confianca: Database["public"]["Enums"]["confidence_level"]
          connector_id: string
          created_at: string
          duracao: number | null
          empresa_id: string
          erro_detalhes: string | null
          evidencias: string[]
          fim_execucao: string | null
          hash_documento: string | null
          id: string
          inicio_execucao: string
          resultado_bruto: string
          status: Database["public"]["Enums"]["run_status"]
          status_normalizado: string
          tentativa: number
          validacao_avisos: string[] | null
          validacao_erros: string[] | null
        }
        Insert: {
          cnd_item_id?: string | null
          confianca?: Database["public"]["Enums"]["confidence_level"]
          connector_id: string
          created_at?: string
          duracao?: number | null
          empresa_id: string
          erro_detalhes?: string | null
          evidencias?: string[]
          fim_execucao?: string | null
          hash_documento?: string | null
          id?: string
          inicio_execucao?: string
          resultado_bruto?: string
          status?: Database["public"]["Enums"]["run_status"]
          status_normalizado?: string
          tentativa?: number
          validacao_avisos?: string[] | null
          validacao_erros?: string[] | null
        }
        Update: {
          cnd_item_id?: string | null
          confianca?: Database["public"]["Enums"]["confidence_level"]
          connector_id?: string
          created_at?: string
          duracao?: number | null
          empresa_id?: string
          erro_detalhes?: string | null
          evidencias?: string[]
          fim_execucao?: string | null
          hash_documento?: string | null
          id?: string
          inicio_execucao?: string
          resultado_bruto?: string
          status?: Database["public"]["Enums"]["run_status"]
          status_normalizado?: string
          tentativa?: number
          validacao_avisos?: string[] | null
          validacao_erros?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "connector_runs_cnd_item_id_fkey"
            columns: ["cnd_item_id"]
            isOneToOne: false
            referencedRelation: "cnd_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_runs_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_runs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      connectors: {
        Row: {
          config: Json
          created_at: string
          descricao: string
          id: string
          nome: string
          orgao: Database["public"]["Enums"]["cnd_tipo"]
          status: Database["public"]["Enums"]["connector_status"]
          taxa_sucesso: number
          tempo_medio: number
          tipo: Database["public"]["Enums"]["connector_type"]
          ultimo_teste: string | null
          updated_at: string
          versao: string
        }
        Insert: {
          config?: Json
          created_at?: string
          descricao?: string
          id?: string
          nome: string
          orgao: Database["public"]["Enums"]["cnd_tipo"]
          status?: Database["public"]["Enums"]["connector_status"]
          taxa_sucesso?: number
          tempo_medio?: number
          tipo: Database["public"]["Enums"]["connector_type"]
          ultimo_teste?: string | null
          updated_at?: string
          versao?: string
        }
        Update: {
          config?: Json
          created_at?: string
          descricao?: string
          id?: string
          nome?: string
          orgao?: Database["public"]["Enums"]["cnd_tipo"]
          status?: Database["public"]["Enums"]["connector_status"]
          taxa_sucesso?: number
          tempo_medio?: number
          tipo?: Database["public"]["Enums"]["connector_type"]
          ultimo_teste?: string | null
          updated_at?: string
          versao?: string
        }
        Relationships: []
      }
      documentos: {
        Row: {
          cnd_item_id: string | null
          created_at: string
          data_upload: string
          empresa_id: string
          id: string
          nome: string
          observacao: string
          responsavel: string
          storage_path: string
          tamanho: string
          tipo: Database["public"]["Enums"]["cnd_tipo"]
          updated_at: string
          validade: string | null
          versao: number
        }
        Insert: {
          cnd_item_id?: string | null
          created_at?: string
          data_upload?: string
          empresa_id: string
          id?: string
          nome: string
          observacao?: string
          responsavel?: string
          storage_path?: string
          tamanho?: string
          tipo: Database["public"]["Enums"]["cnd_tipo"]
          updated_at?: string
          validade?: string | null
          versao?: number
        }
        Update: {
          cnd_item_id?: string | null
          created_at?: string
          data_upload?: string
          empresa_id?: string
          id?: string
          nome?: string
          observacao?: string
          responsavel?: string
          storage_path?: string
          tamanho?: string
          tipo?: Database["public"]["Enums"]["cnd_tipo"]
          updated_at?: string
          validade?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_cnd_item_id_fkey"
            columns: ["cnd_item_id"]
            isOneToOne: false
            referencedRelation: "cnd_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          canal_preferido: Database["public"]["Enums"]["canal_envio"] | null
          cnpj: string
          comunicacao_ativa: boolean
          created_at: string
          drive_folder_id: string | null
          email_principal: string
          email_validado: boolean
          estado: string
          id: string
          municipio: string
          nome_fantasia: string
          observacoes: string
          razao_social: string
          regime_tributario: Database["public"]["Enums"]["regime_tributario"]
          responsavel_cliente: string
          responsavel_interno: string
          saudacao_guia: string
          status: Database["public"]["Enums"]["empresa_status"]
          updated_at: string
          whatsapp_opt_in_at: string | null
          whatsapp_principal: string
        }
        Insert: {
          canal_preferido?: Database["public"]["Enums"]["canal_envio"] | null
          cnpj: string
          comunicacao_ativa?: boolean
          created_at?: string
          drive_folder_id?: string | null
          email_principal?: string
          email_validado?: boolean
          estado?: string
          id?: string
          municipio?: string
          nome_fantasia?: string
          observacoes?: string
          razao_social: string
          regime_tributario?: Database["public"]["Enums"]["regime_tributario"]
          responsavel_cliente?: string
          responsavel_interno?: string
          saudacao_guia?: string
          status?: Database["public"]["Enums"]["empresa_status"]
          updated_at?: string
          whatsapp_opt_in_at?: string | null
          whatsapp_principal?: string
        }
        Update: {
          canal_preferido?: Database["public"]["Enums"]["canal_envio"] | null
          cnpj?: string
          comunicacao_ativa?: boolean
          created_at?: string
          drive_folder_id?: string | null
          email_principal?: string
          email_validado?: boolean
          estado?: string
          id?: string
          municipio?: string
          nome_fantasia?: string
          observacoes?: string
          razao_social?: string
          regime_tributario?: Database["public"]["Enums"]["regime_tributario"]
          responsavel_cliente?: string
          responsavel_interno?: string
          saudacao_guia?: string
          status?: Database["public"]["Enums"]["empresa_status"]
          updated_at?: string
          whatsapp_opt_in_at?: string | null
          whatsapp_principal?: string
        }
        Relationships: []
      }
      envios: {
        Row: {
          assunto: string
          canal: Database["public"]["Enums"]["canal_envio"]
          created_at: string
          data_envio: string
          destinatario: string
          documento_ids: string[]
          empresa_id: string
          id: string
          mensagem: string
          status: Database["public"]["Enums"]["envio_status"]
          usuario: string
        }
        Insert: {
          assunto?: string
          canal: Database["public"]["Enums"]["canal_envio"]
          created_at?: string
          data_envio?: string
          destinatario: string
          documento_ids?: string[]
          empresa_id: string
          id?: string
          mensagem?: string
          status?: Database["public"]["Enums"]["envio_status"]
          usuario?: string
        }
        Update: {
          assunto?: string
          canal?: Database["public"]["Enums"]["canal_envio"]
          created_at?: string
          data_envio?: string
          destinatario?: string
          documento_ids?: string[]
          empresa_id?: string
          id?: string
          mensagem?: string
          status?: Database["public"]["Enums"]["envio_status"]
          usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "envios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      exceptions: {
        Row: {
          acao_sugerida: string
          cnd_item_id: string | null
          cnd_tipo: string
          cnpj: string
          connector_nome: string
          created_at: string
          criticidade: Database["public"]["Enums"]["exception_criticidade"]
          empresa_id: string
          id: string
          motivo: string
          resolvido_em: string | null
          resolvido_por: string | null
          responsavel: string | null
          run_id: string
          sla_horas: number
          status_excecao: Database["public"]["Enums"]["exception_status"]
          tentativas: number
          tipologia: Database["public"]["Enums"]["exception_tipologia"]
        }
        Insert: {
          acao_sugerida?: string
          cnd_item_id?: string | null
          cnd_tipo?: string
          cnpj?: string
          connector_nome?: string
          created_at?: string
          criticidade?: Database["public"]["Enums"]["exception_criticidade"]
          empresa_id: string
          id?: string
          motivo: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          responsavel?: string | null
          run_id: string
          sla_horas?: number
          status_excecao?: Database["public"]["Enums"]["exception_status"]
          tentativas?: number
          tipologia: Database["public"]["Enums"]["exception_tipologia"]
        }
        Update: {
          acao_sugerida?: string
          cnd_item_id?: string | null
          cnd_tipo?: string
          cnpj?: string
          connector_nome?: string
          created_at?: string
          criticidade?: Database["public"]["Enums"]["exception_criticidade"]
          empresa_id?: string
          id?: string
          motivo?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          responsavel?: string | null
          run_id?: string
          sla_horas?: number
          status_excecao?: Database["public"]["Enums"]["exception_status"]
          tentativas?: number
          tipologia?: Database["public"]["Enums"]["exception_tipologia"]
        }
        Relationships: [
          {
            foreignKeyName: "exceptions_cnd_item_id_fkey"
            columns: ["cnd_item_id"]
            isOneToOne: false
            referencedRelation: "cnd_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exceptions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exceptions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "connector_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fator_r_alerts: {
        Row: {
          alert_type: string
          body: string
          company_id: string | null
          created_at: string
          error_message: string | null
          id: string
          monthly_result_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          body?: string
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          monthly_result_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          body?: string
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          monthly_result_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fator_r_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "fator_r_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fator_r_alerts_monthly_result_id_fkey"
            columns: ["monthly_result_id"]
            isOneToOne: false
            referencedRelation: "fator_r_monthly_results"
            referencedColumns: ["id"]
          },
        ]
      }
      fator_r_audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      fator_r_companies: {
        Row: {
          active: boolean
          cnpj: string | null
          created_at: string
          drive_folder_id: string | null
          id: string
          name: string
          normalized_cnpj: string | null
          responsible_email: string | null
          secondary_emails: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          cnpj?: string | null
          created_at?: string
          drive_folder_id?: string | null
          id?: string
          name: string
          normalized_cnpj?: string | null
          responsible_email?: string | null
          secondary_emails?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          cnpj?: string | null
          created_at?: string
          drive_folder_id?: string | null
          id?: string
          name?: string
          normalized_cnpj?: string | null
          responsible_email?: string | null
          secondary_emails?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fator_r_documents: {
        Row: {
          alert_reason: string | null
          anexo: string | null
          cloud_storage_path: string | null
          company_id: string | null
          computed_fator_r: number | null
          created_at: string
          das_total: number | null
          declared_fator_r: number | null
          detected_cnpj: string | null
          detected_company_name: string | null
          drive_file_id: string
          drive_file_name: string
          drive_folder_id: string | null
          drive_mime_type: string | null
          drive_parent_path: string | null
          drive_processed_file_id: string | null
          drive_processed_folder_id: string | null
          drive_web_url: string | null
          email_sent_at: string | null
          email_status: string | null
          error_message: string | null
          extracted_data: Json
          extraction_confidence: number | null
          fator_r: number | null
          fator_r_percent: number | null
          fator_r_status: string | null
          file_hash: string | null
          file_month: number | null
          file_year: number | null
          id: string
          not_applicable: boolean | null
          parse_json: Json | null
          payment_recognized: boolean | null
          payroll12: number | null
          processed_at: string | null
          processing_status: string
          raw_text: string | null
          rbt12: number | null
          rpa: number | null
          storage_status: string
          uploaded_at: string | null
          user_id: string | null
        }
        Insert: {
          alert_reason?: string | null
          anexo?: string | null
          cloud_storage_path?: string | null
          company_id?: string | null
          computed_fator_r?: number | null
          created_at?: string
          das_total?: number | null
          declared_fator_r?: number | null
          detected_cnpj?: string | null
          detected_company_name?: string | null
          drive_file_id: string
          drive_file_name: string
          drive_folder_id?: string | null
          drive_mime_type?: string | null
          drive_parent_path?: string | null
          drive_processed_file_id?: string | null
          drive_processed_folder_id?: string | null
          drive_web_url?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          error_message?: string | null
          extracted_data?: Json
          extraction_confidence?: number | null
          fator_r?: number | null
          fator_r_percent?: number | null
          fator_r_status?: string | null
          file_hash?: string | null
          file_month?: number | null
          file_year?: number | null
          id?: string
          not_applicable?: boolean | null
          parse_json?: Json | null
          payment_recognized?: boolean | null
          payroll12?: number | null
          processed_at?: string | null
          processing_status?: string
          raw_text?: string | null
          rbt12?: number | null
          rpa?: number | null
          storage_status?: string
          uploaded_at?: string | null
          user_id?: string | null
        }
        Update: {
          alert_reason?: string | null
          anexo?: string | null
          cloud_storage_path?: string | null
          company_id?: string | null
          computed_fator_r?: number | null
          created_at?: string
          das_total?: number | null
          declared_fator_r?: number | null
          detected_cnpj?: string | null
          detected_company_name?: string | null
          drive_file_id?: string
          drive_file_name?: string
          drive_folder_id?: string | null
          drive_mime_type?: string | null
          drive_parent_path?: string | null
          drive_processed_file_id?: string | null
          drive_processed_folder_id?: string | null
          drive_web_url?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          error_message?: string | null
          extracted_data?: Json
          extraction_confidence?: number | null
          fator_r?: number | null
          fator_r_percent?: number | null
          fator_r_status?: string | null
          file_hash?: string | null
          file_month?: number | null
          file_year?: number | null
          id?: string
          not_applicable?: boolean | null
          parse_json?: Json | null
          payment_recognized?: boolean | null
          payroll12?: number | null
          processed_at?: string | null
          processing_status?: string
          raw_text?: string | null
          rbt12?: number | null
          rpa?: number | null
          storage_status?: string
          uploaded_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fator_r_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "fator_r_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fator_r_drive_folders: {
        Row: {
          created_at: string
          drive_folder_id: string
          id: string
          kind: string
          parent_folder_id: string | null
          path: string
        }
        Insert: {
          created_at?: string
          drive_folder_id: string
          id?: string
          kind: string
          parent_folder_id?: string | null
          path: string
        }
        Update: {
          created_at?: string
          drive_folder_id?: string
          id?: string
          kind?: string
          parent_folder_id?: string | null
          path?: string
        }
        Relationships: []
      }
      fator_r_monthly_results: {
        Row: {
          alert_reason: string | null
          anexo: string | null
          company_id: string
          computed_fator_r: number | null
          created_at: string
          das_total: number | null
          declared_fator_r: number | null
          document_id: string | null
          fator_r_percent: number | null
          fator_r_value: number | null
          id: string
          metadata: Json
          not_applicable: boolean | null
          payment_recognized: boolean | null
          payroll_12m: number | null
          recommendation: string | null
          reference_month: number
          reference_year: number
          revenue_12m: number | null
          rpa: number | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          alert_reason?: string | null
          anexo?: string | null
          company_id: string
          computed_fator_r?: number | null
          created_at?: string
          das_total?: number | null
          declared_fator_r?: number | null
          document_id?: string | null
          fator_r_percent?: number | null
          fator_r_value?: number | null
          id?: string
          metadata?: Json
          not_applicable?: boolean | null
          payment_recognized?: boolean | null
          payroll_12m?: number | null
          recommendation?: string | null
          reference_month: number
          reference_year: number
          revenue_12m?: number | null
          rpa?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          alert_reason?: string | null
          anexo?: string | null
          company_id?: string
          computed_fator_r?: number | null
          created_at?: string
          das_total?: number | null
          declared_fator_r?: number | null
          document_id?: string | null
          fator_r_percent?: number | null
          fator_r_value?: number | null
          id?: string
          metadata?: Json
          not_applicable?: boolean | null
          payment_recognized?: boolean | null
          payroll_12m?: number | null
          recommendation?: string | null
          reference_month?: number
          reference_year?: number
          revenue_12m?: number | null
          rpa?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fator_r_monthly_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "fator_r_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fator_r_monthly_results_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "fator_r_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      fator_r_processing_logs: {
        Row: {
          company_id: string | null
          created_at: string
          document_id: string | null
          event_type: string
          id: string
          message: string
          payload: Json
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          document_id?: string | null
          event_type: string
          id?: string
          message?: string
          payload?: Json
        }
        Update: {
          company_id?: string | null
          created_at?: string
          document_id?: string | null
          event_type?: string
          id?: string
          message?: string
          payload?: Json
        }
        Relationships: []
      }
      fator_r_sync_config: {
        Row: {
          email_alerts_enabled: boolean
          id: string
          last_run_at: string | null
          sync_enabled: boolean
          updated_at: string
        }
        Insert: {
          email_alerts_enabled?: boolean
          id?: string
          last_run_at?: string | null
          sync_enabled?: boolean
          updated_at?: string
        }
        Update: {
          email_alerts_enabled?: boolean
          id?: string
          last_run_at?: string | null
          sync_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          description: string
          enabled: boolean
          key: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          description?: string
          enabled?: boolean
          key: string
          updated_at?: string
          value_json?: Json
        }
        Update: {
          description?: string
          enabled?: boolean
          key?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: []
      }
      guia_envios: {
        Row: {
          assunto: string | null
          canal: Database["public"]["Enums"]["guia_canal"]
          created_at: string
          delivered_at: string | null
          destinatario: string
          empresa_id: string | null
          failed_at: string | null
          guia_id: string
          id: string
          idempotency_key: string
          mensagem_preview: string | null
          provider_message_id: string | null
          sanitized_payload: Json
          status: Database["public"]["Enums"]["guia_envio_status"]
          submitted_at: string
          template_sid: string | null
        }
        Insert: {
          assunto?: string | null
          canal: Database["public"]["Enums"]["guia_canal"]
          created_at?: string
          delivered_at?: string | null
          destinatario: string
          empresa_id?: string | null
          failed_at?: string | null
          guia_id: string
          id?: string
          idempotency_key: string
          mensagem_preview?: string | null
          provider_message_id?: string | null
          sanitized_payload?: Json
          status?: Database["public"]["Enums"]["guia_envio_status"]
          submitted_at?: string
          template_sid?: string | null
        }
        Update: {
          assunto?: string | null
          canal?: Database["public"]["Enums"]["guia_canal"]
          created_at?: string
          delivered_at?: string | null
          destinatario?: string
          empresa_id?: string | null
          failed_at?: string | null
          guia_id?: string
          id?: string
          idempotency_key?: string
          mensagem_preview?: string | null
          provider_message_id?: string | null
          sanitized_payload?: Json
          status?: Database["public"]["Enums"]["guia_envio_status"]
          submitted_at?: string
          template_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guia_envios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guia_envios_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "guias"
            referencedColumns: ["id"]
          },
        ]
      }
      guia_eventos: {
        Row: {
          created_at: string
          event_type: string
          guia_id: string | null
          id: string
          level: string
          message: string
          metadata_json: Json
        }
        Insert: {
          created_at?: string
          event_type: string
          guia_id?: string | null
          id?: string
          level?: string
          message?: string
          metadata_json?: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          guia_id?: string | null
          id?: string
          level?: string
          message?: string
          metadata_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "guia_eventos_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "guias"
            referencedColumns: ["id"]
          },
        ]
      }
      guia_excecoes: {
        Row: {
          action_recommended: string | null
          created_at: string
          exception_type: string
          guia_id: string | null
          id: string
          reason: string
          resolved_at: string | null
          severity: string
          status: Database["public"]["Enums"]["guia_excecao_status"]
        }
        Insert: {
          action_recommended?: string | null
          created_at?: string
          exception_type: string
          guia_id?: string | null
          id?: string
          reason: string
          resolved_at?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["guia_excecao_status"]
        }
        Update: {
          action_recommended?: string | null
          created_at?: string
          exception_type?: string
          guia_id?: string | null
          id?: string
          reason?: string
          resolved_at?: string | null
          severity?: string
          status?: Database["public"]["Enums"]["guia_excecao_status"]
        }
        Relationships: [
          {
            foreignKeyName: "guia_excecoes_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "guias"
            referencedColumns: ["id"]
          },
        ]
      }
      guias: {
        Row: {
          cnpj_detectado: string | null
          competencia: string | null
          created_at: string
          drive_file_id: string
          empresa_id: string | null
          extraction_method: string | null
          file_name: string
          has_text_layer: boolean | null
          id: string
          match_source: Database["public"]["Enums"]["guia_match_source"] | null
          mime_type: string
          pagina_count: number | null
          pasta_atual: string
          processed_at: string | null
          provider_error: string | null
          received_at: string
          sent_at: string | null
          sent_folder_id: string | null
          sha256: string | null
          source_folder_id: string | null
          status: Database["public"]["Enums"]["guia_status"]
          texto_extraido_preview: string | null
          tipo_guia: string | null
          updated_at: string
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          cnpj_detectado?: string | null
          competencia?: string | null
          created_at?: string
          drive_file_id: string
          empresa_id?: string | null
          extraction_method?: string | null
          file_name: string
          has_text_layer?: boolean | null
          id?: string
          match_source?: Database["public"]["Enums"]["guia_match_source"] | null
          mime_type?: string
          pagina_count?: number | null
          pasta_atual?: string
          processed_at?: string | null
          provider_error?: string | null
          received_at?: string
          sent_at?: string | null
          sent_folder_id?: string | null
          sha256?: string | null
          source_folder_id?: string | null
          status?: Database["public"]["Enums"]["guia_status"]
          texto_extraido_preview?: string | null
          tipo_guia?: string | null
          updated_at?: string
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          cnpj_detectado?: string | null
          competencia?: string | null
          created_at?: string
          drive_file_id?: string
          empresa_id?: string | null
          extraction_method?: string | null
          file_name?: string
          has_text_layer?: boolean | null
          id?: string
          match_source?: Database["public"]["Enums"]["guia_match_source"] | null
          mime_type?: string
          pagina_count?: number | null
          pasta_atual?: string
          processed_at?: string | null
          provider_error?: string | null
          received_at?: string
          sent_at?: string | null
          sent_folder_id?: string | null
          sha256?: string | null
          source_folder_id?: string | null
          status?: Database["public"]["Enums"]["guia_status"]
          texto_extraido_preview?: string | null
          tipo_guia?: string | null
          updated_at?: string
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      health_logs: {
        Row: {
          connector_id: string
          detalhes: string
          id: string
          latencia: number
          status: Database["public"]["Enums"]["health_status"]
          timestamp: string
        }
        Insert: {
          connector_id: string
          detalhes?: string
          id?: string
          latencia?: number
          status?: Database["public"]["Enums"]["health_status"]
          timestamp?: string
        }
        Update: {
          connector_id?: string
          detalhes?: string
          id?: string
          latencia?: number
          status?: Database["public"]["Enums"]["health_status"]
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_logs_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      hmac_nonces: {
        Row: {
          direction: string
          expires_at: string
          nonce: string
        }
        Insert: {
          direction: string
          expires_at: string
          nonce: string
        }
        Update: {
          direction?: string
          expires_at?: string
          nonce?: string
        }
        Relationships: []
      }
      integracoes_guias: {
        Row: {
          created_at: string
          display_name: string
          last_check_at: string | null
          last_error: string | null
          provider: string
          schedule_minutes: number
          sender_identity: string | null
          sent_folder_id: string | null
          source_folder_id: string | null
          status: Database["public"]["Enums"]["guia_integracao_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          last_check_at?: string | null
          last_error?: string | null
          provider: string
          schedule_minutes?: number
          sender_identity?: string | null
          sent_folder_id?: string | null
          source_folder_id?: string | null
          status?: Database["public"]["Enums"]["guia_integracao_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          last_check_at?: string | null
          last_error?: string | null
          provider?: string
          schedule_minutes?: number
          sender_identity?: string | null
          sent_folder_id?: string | null
          source_folder_id?: string | null
          status?: Database["public"]["Enums"]["guia_integracao_status"]
          updated_at?: string
        }
        Relationships: []
      }
      logs_acesso: {
        Row: {
          acao: Database["public"]["Enums"]["log_acao"]
          canal: Database["public"]["Enums"]["canal_envio"] | null
          data_hora: string
          destinatario: string | null
          detalhes: string
          documento_id: string | null
          empresa_id: string
          envio_id: string | null
          id: string
          usuario: string
        }
        Insert: {
          acao: Database["public"]["Enums"]["log_acao"]
          canal?: Database["public"]["Enums"]["canal_envio"] | null
          data_hora?: string
          destinatario?: string | null
          detalhes?: string
          documento_id?: string | null
          empresa_id: string
          envio_id?: string | null
          id?: string
          usuario?: string
        }
        Update: {
          acao?: Database["public"]["Enums"]["log_acao"]
          canal?: Database["public"]["Enums"]["canal_envio"] | null
          data_hora?: string
          destinatario?: string | null
          detalhes?: string
          documento_id?: string | null
          empresa_id?: string
          envio_id?: string | null
          id?: string
          usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_acesso_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_acesso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_acesso_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_health: {
        Row: {
          avg_latency_ms_24h: number
          current_concurrency: number
          id: string
          last_error_at: string | null
          last_error_message: string | null
          last_heartbeat_at: string | null
          metadata_json: Json
          open_circuit: boolean
          provider_name: string
          provider_runtime: Database["public"]["Enums"]["provider_runtime"]
          status: Database["public"]["Enums"]["provider_health_status"]
          success_rate_24h: number
          updated_at: string
        }
        Insert: {
          avg_latency_ms_24h?: number
          current_concurrency?: number
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_heartbeat_at?: string | null
          metadata_json?: Json
          open_circuit?: boolean
          provider_name: string
          provider_runtime: Database["public"]["Enums"]["provider_runtime"]
          status?: Database["public"]["Enums"]["provider_health_status"]
          success_rate_24h?: number
          updated_at?: string
        }
        Update: {
          avg_latency_ms_24h?: number
          current_concurrency?: number
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_heartbeat_at?: string | null
          metadata_json?: Json
          open_circuit?: boolean
          provider_name?: string
          provider_runtime?: Database["public"]["Enums"]["provider_runtime"]
          status?: Database["public"]["Enums"]["provider_health_status"]
          success_rate_24h?: number
          updated_at?: string
        }
        Relationships: []
      }
      retry_policies: {
        Row: {
          backoff_multiplier: number
          connector_id: string
          id: string
          intervalo_base: number
          max_tentativas: number
          timeout_segundos: number
        }
        Insert: {
          backoff_multiplier?: number
          connector_id: string
          id?: string
          intervalo_base?: number
          max_tentativas?: number
          timeout_segundos?: number
        }
        Update: {
          backoff_multiplier?: number
          connector_id?: string
          id?: string
          intervalo_base?: number
          max_tentativas?: number
          timeout_segundos?: number
        }
        Relationships: [
          {
            foreignKeyName: "retry_policies_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: true
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_rules: {
        Row: {
          cnd_tipo: Database["public"]["Enums"]["cnd_tipo"]
          connector_id: string
          dias_antes_vencimento: number
          id: string
          intervalo_horas: number
          prioridade: number
        }
        Insert: {
          cnd_tipo: Database["public"]["Enums"]["cnd_tipo"]
          connector_id: string
          dias_antes_vencimento?: number
          id?: string
          intervalo_horas?: number
          prioridade?: number
        }
        Update: {
          cnd_tipo?: Database["public"]["Enums"]["cnd_tipo"]
          connector_id?: string
          dias_antes_vencimento?: number
          id?: string
          intervalo_horas?: number
          prioridade?: number
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_rules_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_reform_alerts: {
        Row: {
          alert_type: string
          analysis_id: string
          created_at: string
          id: string
          message: string
          severity: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          analysis_id: string
          created_at?: string
          id?: string
          message: string
          severity?: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          analysis_id?: string
          created_at?: string
          id?: string
          message?: string
          severity?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_reform_alerts_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "tax_reform_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_reform_analyses: {
        Row: {
          analysis_year: number
          automatic_summary: string | null
          company_id: string
          confidence_level: string | null
          confidence_reason: string | null
          created_at: string
          final_decision: string | null
          id: string
          manual_opinion: string | null
          recommendation: string | null
          risk_level: string | null
          score_clients: number | null
          score_costs: number | null
          score_current_tax: number | null
          score_total: number | null
          status: string
          updated_at: string
        }
        Insert: {
          analysis_year: number
          automatic_summary?: string | null
          company_id: string
          confidence_level?: string | null
          confidence_reason?: string | null
          created_at?: string
          final_decision?: string | null
          id?: string
          manual_opinion?: string | null
          recommendation?: string | null
          risk_level?: string | null
          score_clients?: number | null
          score_costs?: number | null
          score_current_tax?: number | null
          score_total?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          analysis_year?: number
          automatic_summary?: string | null
          company_id?: string
          confidence_level?: string | null
          confidence_reason?: string | null
          created_at?: string
          final_decision?: string | null
          id?: string
          manual_opinion?: string | null
          recommendation?: string | null
          risk_level?: string | null
          score_clients?: number | null
          score_costs?: number | null
          score_current_tax?: number | null
          score_total?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_reform_analyses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "tax_reform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_reform_answers: {
        Row: {
          analysis_id: string
          answer_type: string
          answer_value: Json | null
          created_at: string
          id: string
          question_key: string
          question_label: string
          updated_at: string
        }
        Insert: {
          analysis_id: string
          answer_type: string
          answer_value?: Json | null
          created_at?: string
          id?: string
          question_key: string
          question_label: string
          updated_at?: string
        }
        Update: {
          analysis_id?: string
          answer_type?: string
          answer_value?: Json | null
          created_at?: string
          id?: string
          question_key?: string
          question_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_reform_answers_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "tax_reform_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_reform_companies: {
        Row: {
          analysis_year: number | null
          cnpj: string
          company_name: string
          created_at: string
          current_tax_regime: string
          effective_tax_rate: number | null
          id: string
          main_activity: string
          notes: string | null
          projected_revenue: number | null
          rbt12: number | null
          responsible_user: string
          updated_at: string
        }
        Insert: {
          analysis_year?: number | null
          cnpj: string
          company_name: string
          created_at?: string
          current_tax_regime: string
          effective_tax_rate?: number | null
          id?: string
          main_activity: string
          notes?: string | null
          projected_revenue?: number | null
          rbt12?: number | null
          responsible_user: string
          updated_at?: string
        }
        Update: {
          analysis_year?: number | null
          cnpj?: string
          company_name?: string
          created_at?: string
          current_tax_regime?: string
          effective_tax_rate?: number | null
          id?: string
          main_activity?: string
          notes?: string | null
          projected_revenue?: number | null
          rbt12?: number | null
          responsible_user?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_reform_documents: {
        Row: {
          analysis_id: string
          company_id: string
          document_confidence_weight: number | null
          document_type: string
          extracted_summary: string | null
          extracted_values: Json | null
          extracted_findings: Json | null
          extraction_confidence: number | null
          extraction_error: string | null
          file_name: string
          file_size: number | null
          file_url: string | null
          id: string
          mime_type: string | null
          reading_status: string
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          upload_error: string | null
          upload_status: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          analysis_id: string
          company_id: string
          document_confidence_weight?: number | null
          document_type: string
          extracted_summary?: string | null
          extracted_values?: Json | null
          extracted_findings?: Json | null
          extraction_confidence?: number | null
          extraction_error?: string | null
          file_name: string
          file_size?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          reading_status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          upload_error?: string | null
          upload_status?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          analysis_id?: string
          company_id?: string
          document_confidence_weight?: number | null
          document_type?: string
          extracted_summary?: string | null
          extracted_values?: Json | null
          extracted_findings?: Json | null
          extraction_confidence?: number | null
          extraction_error?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          reading_status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          upload_error?: string | null
          upload_status?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_reform_documents_analysis_company_fkey"
            columns: ["analysis_id", "company_id"]
            isOneToOne: false
            referencedRelation: "tax_reform_analyses"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "tax_reform_documents_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "tax_reform_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_reform_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "tax_reform_companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      alerta_prioridade: "critica" | "alta" | "media" | "baixa"
      alerta_tipo:
        | "vencimento_7d"
        | "vencimento_3d"
        | "vencimento_1d"
        | "vencimento_hoje"
        | "vencido"
        | "sem_pdf"
        | "checklist_incompleto"
      artifact_type: "screenshot" | "html" | "pdf" | "trace" | "text"
      batch_status:
        | "agendado"
        | "executando"
        | "concluido"
        | "parcial"
        | "falha"
      canal_envio: "email" | "whatsapp"
      cnd_lookup_status:
        | "negativa"
        | "positiva_com_efeitos"
        | "positiva"
        | "nao_emitida"
        | "indisponivel"
        | "captcha"
        | "erro_layout"
        | "manual_required"
        | "erro_transitorio"
      cnd_status:
        | "valida"
        | "vencendo"
        | "vencida"
        | "pendente"
        | "erro"
        | "nao_aplicavel"
      cnd_tipo:
        | "receita_federal"
        | "fgts"
        | "sefaz"
        | "municipal"
        | "trabalhista"
        | "personalizada"
      confidence_level: "alta" | "media" | "baixa"
      connector_status: "ativo" | "inativo" | "manutencao" | "erro"
      connector_type:
        | "api_direta"
        | "browser_headless"
        | "integracao_assistida"
        | "upload_manual"
      empresa_status: "ativa" | "pausada" | "arquivada"
      envio_status: "enviado" | "entregue" | "lido" | "erro" | "pendente"
      exception_criticidade: "critica" | "alta" | "media" | "baixa"
      exception_lifecycle: "open" | "investigating" | "resolved" | "ignored"
      exception_severity: "info" | "warning" | "error" | "critical"
      exception_status: "pendente" | "em_analise" | "resolvida" | "descartada"
      exception_tipologia:
        | "cnpj_inconsistente"
        | "pdf_ausente"
        | "validade_ambigua"
        | "portal_indisponivel"
        | "captcha_bloqueante"
        | "documento_incompativel"
        | "baixa_confianca"
        | "erro_parsing"
        | "falha_integracao"
        | "dado_cadastral_insuficiente"
        | "certidao_positiva"
        | "retorno_inesperado"
      guia_canal: "email" | "whatsapp"
      guia_envio_status: "aceito" | "simulado" | "entregue" | "falhou"
      guia_excecao_status: "open" | "investigating" | "resolved"
      guia_integracao_status: "inativo" | "ativo" | "erro"
      guia_match_source: "cnpj_pdf" | "filename" | "manual"
      guia_status:
        | "aguardando"
        | "lendo"
        | "ocr"
        | "identificada"
        | "enviando"
        | "enviada"
        | "revisao"
        | "erro"
      health_status: "ok" | "degradado" | "indisponivel"
      job_status:
        | "queued"
        | "dispatched"
        | "running"
        | "waiting_callback"
        | "success"
        | "partial"
        | "failed"
        | "manual_required"
        | "retry_scheduled"
        | "cancelled"
      job_type: "cnpj_lookup" | "cnd_lookup" | "dry_run" | "cndt_lookup"
      log_acao: "envio" | "abertura" | "visualizacao" | "download"
      log_level: "info" | "warning" | "error"
      lookup_status:
        | "queued"
        | "running"
        | "success"
        | "partial"
        | "failed"
        | "manual_required"
        | "cancelled"
      provider_health_status: "online" | "degraded" | "offline" | "paused"
      provider_runtime: "cloudflare_worker_browser_run"
      regime_tributario:
        | "simples_nacional"
        | "lucro_presumido"
        | "lucro_real"
        | "mei"
      run_status:
        | "agendado"
        | "executando"
        | "sucesso"
        | "falha"
        | "revisao"
        | "timeout"
        | "cancelado"
        | "bloqueado"
      run_step_etapa:
        | "autenticacao"
        | "consulta"
        | "captura"
        | "parsing"
        | "persistencia"
      run_step_status: "sucesso" | "falha" | "pulado" | "executando"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alerta_prioridade: ["critica", "alta", "media", "baixa"],
      alerta_tipo: [
        "vencimento_7d",
        "vencimento_3d",
        "vencimento_1d",
        "vencimento_hoje",
        "vencido",
        "sem_pdf",
        "checklist_incompleto",
      ],
      artifact_type: ["screenshot", "html", "pdf", "trace", "text"],
      batch_status: ["agendado", "executando", "concluido", "parcial", "falha"],
      canal_envio: ["email", "whatsapp"],
      cnd_lookup_status: [
        "negativa",
        "positiva_com_efeitos",
        "positiva",
        "nao_emitida",
        "indisponivel",
        "captcha",
        "erro_layout",
        "manual_required",
        "erro_transitorio",
      ],
      cnd_status: [
        "valida",
        "vencendo",
        "vencida",
        "pendente",
        "erro",
        "nao_aplicavel",
      ],
      cnd_tipo: [
        "receita_federal",
        "fgts",
        "sefaz",
        "municipal",
        "trabalhista",
        "personalizada",
      ],
      confidence_level: ["alta", "media", "baixa"],
      connector_status: ["ativo", "inativo", "manutencao", "erro"],
      connector_type: [
        "api_direta",
        "browser_headless",
        "integracao_assistida",
        "upload_manual",
      ],
      empresa_status: ["ativa", "pausada", "arquivada"],
      envio_status: ["enviado", "entregue", "lido", "erro", "pendente"],
      exception_criticidade: ["critica", "alta", "media", "baixa"],
      exception_lifecycle: ["open", "investigating", "resolved", "ignored"],
      exception_severity: ["info", "warning", "error", "critical"],
      exception_status: ["pendente", "em_analise", "resolvida", "descartada"],
      exception_tipologia: [
        "cnpj_inconsistente",
        "pdf_ausente",
        "validade_ambigua",
        "portal_indisponivel",
        "captcha_bloqueante",
        "documento_incompativel",
        "baixa_confianca",
        "erro_parsing",
        "falha_integracao",
        "dado_cadastral_insuficiente",
        "certidao_positiva",
        "retorno_inesperado",
      ],
      guia_canal: ["email", "whatsapp"],
      guia_envio_status: ["aceito", "simulado", "entregue", "falhou"],
      guia_excecao_status: ["open", "investigating", "resolved"],
      guia_integracao_status: ["inativo", "ativo", "erro"],
      guia_match_source: ["cnpj_pdf", "filename", "manual"],
      guia_status: [
        "aguardando",
        "lendo",
        "ocr",
        "identificada",
        "enviando",
        "enviada",
        "revisao",
        "erro",
      ],
      health_status: ["ok", "degradado", "indisponivel"],
      job_status: [
        "queued",
        "dispatched",
        "running",
        "waiting_callback",
        "success",
        "partial",
        "failed",
        "manual_required",
        "retry_scheduled",
        "cancelled",
      ],
      job_type: ["cnpj_lookup", "cnd_lookup", "dry_run", "cndt_lookup"],
      log_acao: ["envio", "abertura", "visualizacao", "download"],
      log_level: ["info", "warning", "error"],
      lookup_status: [
        "queued",
        "running",
        "success",
        "partial",
        "failed",
        "manual_required",
        "cancelled",
      ],
      provider_health_status: ["online", "degraded", "offline", "paused"],
      provider_runtime: ["cloudflare_worker_browser_run"],
      regime_tributario: [
        "simples_nacional",
        "lucro_presumido",
        "lucro_real",
        "mei",
      ],
      run_status: [
        "agendado",
        "executando",
        "sucesso",
        "falha",
        "revisao",
        "timeout",
        "cancelado",
        "bloqueado",
      ],
      run_step_etapa: [
        "autenticacao",
        "consulta",
        "captura",
        "parsing",
        "persistencia",
      ],
      run_step_status: ["sucesso", "falha", "pulado", "executando"],
    },
  },
} as const
