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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ab_assignments: {
        Row: {
          created_at: string | null
          id: string
          receptionist_id: string | null
          test_id: string | null
          user_id: string | null
          variant_key: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          receptionist_id?: string | null
          test_id?: string | null
          user_id?: string | null
          variant_key?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          receptionist_id?: string | null
          test_id?: string | null
          user_id?: string | null
          variant_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_assignments_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_tests: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          end_at: string | null
          id: string
          name: string
          slug: string
          start_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          name: string
          slug: string
          start_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          name?: string
          slug?: string
          start_at?: string | null
        }
        Relationships: []
      }
      ab_variants: {
        Row: {
          created_at: string | null
          id: string
          key: string
          payload: Json | null
          test_id: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          payload?: Json | null
          test_id?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          payload?: Json | null
          test_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_variants_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_booking_suggestions: {
        Row: {
          created_at: string
          id: string
          latency_ms: number | null
          model: string | null
          receptionist_id: string
          request_message: string
          suggestions: Json
        }
        Insert: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          receptionist_id: string
          request_message: string
          suggestions: Json
        }
        Update: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          receptionist_id?: string
          request_message?: string
          suggestions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_booking_suggestions_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_response_reviews: {
        Row: {
          action_taken: string | null
          ai_response_id: string | null
          created_at: string | null
          id: string
          note: string | null
          reviewer_id: string | null
        }
        Insert: {
          action_taken?: string | null
          ai_response_id?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          reviewer_id?: string | null
        }
        Update: {
          action_taken?: string | null
          ai_response_id?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_response_reviews_ai_response_id_fkey"
            columns: ["ai_response_id"]
            isOneToOne: false
            referencedRelation: "ai_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_responses: {
        Row: {
          channel: string | null
          confidence: number | null
          created_at: string | null
          flagged: boolean | null
          id: string
          latency_ms: number | null
          model: string | null
          quality_score: Json | null
          receptionist_id: string | null
          reply_text: string | null
          request_message: string | null
          tags: string[] | null
          temperature: number | null
          user_id: string | null
        }
        Insert: {
          channel?: string | null
          confidence?: number | null
          created_at?: string | null
          flagged?: boolean | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          quality_score?: Json | null
          receptionist_id?: string | null
          reply_text?: string | null
          request_message?: string | null
          tags?: string[] | null
          temperature?: number | null
          user_id?: string | null
        }
        Update: {
          channel?: string | null
          confidence?: number | null
          created_at?: string | null
          flagged?: boolean | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          quality_score?: Json | null
          receptionist_id?: string | null
          reply_text?: string | null
          request_message?: string | null
          tags?: string[] | null
          temperature?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_responses_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_worker_tasks: {
        Row: {
          attempt_count: number
          checkpoint_json: Json
          created_at: string
          created_by: string
          error_text: string | null
          finished_at: string | null
          goal: string
          id: string
          input_json: Json
          output_json: Json | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          attempt_count?: number
          checkpoint_json?: Json
          created_at?: string
          created_by: string
          error_text?: string | null
          finished_at?: string | null
          goal: string
          id?: string
          input_json?: Json
          output_json?: Json | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          attempt_count?: number
          checkpoint_json?: Json
          created_at?: string
          created_by?: string
          error_text?: string | null
          finished_at?: string | null
          goal?: string
          id?: string
          input_json?: Json
          output_json?: Json | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_worker_tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "ai_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_workers: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          definition: Json
          description: string
          id: string
          name: string
          organization_id: string | null
          published_at: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          definition?: Json
          description?: string
          id?: string
          name: string
          organization_id?: string | null
          published_at?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          definition?: Json
          description?: string
          id?: string
          name?: string
          organization_id?: string | null
          published_at?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_workers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_cache: {
        Row: {
          data: Json
          id: string
          receptionist_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          data: Json
          id?: string
          receptionist_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          data?: Json
          id?: string
          receptionist_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_cache_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_logs: {
        Row: {
          action: string
          actor_id: string | null
          appointment_id: string
          created_at: string
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          appointment_id: string
          created_at?: string
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          appointment_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_slots: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_available: boolean
          metadata: Json | null
          receptionist_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_available?: boolean
          metadata?: Json | null
          receptionist_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_available?: boolean
          metadata?: Json | null
          receptionist_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_slots_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          booking_source: string | null
          cancellation_token: string | null
          confirmation_token: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          end_time: string
          google_event_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          notes: string | null
          receptionist_id: string
          recurrence: Json | null
          service: string
          service_field_responses: Json | null
          service_id: string | null
          staff_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"] | null
          triage_level: string | null
        }
        Insert: {
          booking_source?: string | null
          cancellation_token?: string | null
          confirmation_token?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          end_time: string
          google_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          receptionist_id: string
          recurrence?: Json | null
          service: string
          service_field_responses?: Json | null
          service_id?: string | null
          staff_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          triage_level?: string | null
        }
        Update: {
          booking_source?: string | null
          cancellation_token?: string | null
          confirmation_token?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          end_time?: string
          google_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          receptionist_id?: string
          recurrence?: Json | null
          service?: string
          service_field_responses?: Json | null
          service_id?: string | null
          staff_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          triage_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_exceptions: {
        Row: {
          created_at: string
          end_timestamptz: string
          id: string
          reason: string | null
          receptionist_id: string
          start_timestamptz: string
        }
        Insert: {
          created_at?: string
          end_timestamptz: string
          id?: string
          reason?: string | null
          receptionist_id: string
          start_timestamptz: string
        }
        Update: {
          created_at?: string
          end_timestamptz?: string
          id?: string
          reason?: string | null
          receptionist_id?: string
          start_timestamptz?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          priority: number
          receptionist_id: string
          staff_id: string | null
          start_time: string
          timezone: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          priority?: number
          receptionist_id: string
          staff_id?: string | null
          start_time: string
          timezone?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          priority?: number
          receptionist_id?: string
          staff_id?: string | null
          start_time?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_series: {
        Row: {
          created_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          day_of_month: number | null
          days_of_week: number[] | null
          duration_minutes: number | null
          end_date: string | null
          frequency: string
          id: string
          interval: number | null
          max_occurrences: number | null
          next_occurrence_date: string | null
          occurrences_created: number | null
          receptionist_id: string
          service_id: string | null
          staff_id: string | null
          start_date: string
          start_time: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          day_of_month?: number | null
          days_of_week?: number[] | null
          duration_minutes?: number | null
          end_date?: string | null
          frequency: string
          id?: string
          interval?: number | null
          max_occurrences?: number | null
          next_occurrence_date?: string | null
          occurrences_created?: number | null
          receptionist_id: string
          service_id?: string | null
          staff_id?: string | null
          start_date: string
          start_time: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          day_of_month?: number | null
          days_of_week?: number[] | null
          duration_minutes?: number | null
          end_date?: string | null
          frequency?: string
          id?: string
          interval?: number | null
          max_occurrences?: number | null
          next_occurrence_date?: string | null
          occurrences_created?: number | null
          receptionist_id?: string
          service_id?: string | null
          staff_id?: string | null
          start_date?: string
          start_time?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_series_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_series_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_series_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_series_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      business_modules: {
        Row: {
          config_json: Json | null
          created_at: string
          enabled: boolean
          id: string
          module_key: string
          receptionist_id: string
          tier_override: number | null
          updated_at: string
        }
        Insert: {
          config_json?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          module_key: string
          receptionist_id: string
          tier_override?: number | null
          updated_at?: string
        }
        Update: {
          config_json?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          module_key?: string
          receptionist_id?: string
          tier_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_modules_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json | null
          receptionist_id: string
          sender: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          receptionist_id: string
          sender: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          receptionist_id?: string
          sender?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      config_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          change_source: string
          config_json: Json
          created_at: string
          id: string
          owner_input: string | null
          plan_text: string | null
          reasoning_notes: string | null
          receptionist_id: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          change_source?: string
          config_json: Json
          created_at?: string
          id?: string
          owner_input?: string | null
          plan_text?: string | null
          reasoning_notes?: string | null
          receptionist_id: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          change_source?: string
          config_json?: Json
          created_at?: string
          id?: string
          owner_input?: string | null
          plan_text?: string | null
          reasoning_notes?: string | null
          receptionist_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "config_versions_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_definitions: {
        Row: {
          auth_type: string
          brand_color: string | null
          category: Database["public"]["Enums"]["connector_category"]
          connector_key: string
          created_at: string | null
          description: string
          display_name: string
          help_url: string | null
          icon_name: string | null
          id: string
          is_coming_soon: boolean | null
          is_google_family: boolean | null
          oauth_provider: string | null
          oauth_scopes: string[] | null
          required_by_modules: string[] | null
          setup_url: string | null
          supports_one_click_connect: boolean | null
          tier_1_description: string | null
          tier_2_description: string | null
          tier_3_description: string | null
        }
        Insert: {
          auth_type?: string
          brand_color?: string | null
          category: Database["public"]["Enums"]["connector_category"]
          connector_key: string
          created_at?: string | null
          description: string
          display_name: string
          help_url?: string | null
          icon_name?: string | null
          id?: string
          is_coming_soon?: boolean | null
          is_google_family?: boolean | null
          oauth_provider?: string | null
          oauth_scopes?: string[] | null
          required_by_modules?: string[] | null
          setup_url?: string | null
          supports_one_click_connect?: boolean | null
          tier_1_description?: string | null
          tier_2_description?: string | null
          tier_3_description?: string | null
        }
        Update: {
          auth_type?: string
          brand_color?: string | null
          category?: Database["public"]["Enums"]["connector_category"]
          connector_key?: string
          created_at?: string | null
          description?: string
          display_name?: string
          help_url?: string | null
          icon_name?: string | null
          id?: string
          is_coming_soon?: boolean | null
          is_google_family?: boolean | null
          oauth_provider?: string | null
          oauth_scopes?: string[] | null
          required_by_modules?: string[] | null
          setup_url?: string | null
          supports_one_click_connect?: boolean | null
          tier_1_description?: string | null
          tier_2_description?: string | null
          tier_3_description?: string | null
        }
        Relationships: []
      }
      connectors: {
        Row: {
          category: Database["public"]["Enums"]["connector_category"]
          config_json: Json | null
          connected_at: string | null
          connector_key: string
          created_at: string | null
          current_tier: number | null
          description: string | null
          display_name: string
          expires_at: string | null
          id: string
          last_error: string | null
          last_health_check: string | null
          status: Database["public"]["Enums"]["connector_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["connector_category"]
          config_json?: Json | null
          connected_at?: string | null
          connector_key: string
          created_at?: string | null
          current_tier?: number | null
          description?: string | null
          display_name: string
          expires_at?: string | null
          id?: string
          last_error?: string | null
          last_health_check?: string | null
          status?: Database["public"]["Enums"]["connector_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["connector_category"]
          config_json?: Json | null
          connected_at?: string | null
          connector_key?: string
          created_at?: string | null
          current_tier?: number | null
          description?: string | null
          display_name?: string
          expires_at?: string | null
          id?: string
          last_error?: string | null
          last_health_check?: string | null
          status?: Database["public"]["Enums"]["connector_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      conversation_state: {
        Row: {
          active_flow: string | null
          active_topic: string | null
          created_at: string | null
          flow_step: string | null
          id: string
          last_message_at: string | null
          receptionist_id: string
          session_id: string
          slots: Json | null
          topic_confidence: number | null
        }
        Insert: {
          active_flow?: string | null
          active_topic?: string | null
          created_at?: string | null
          flow_step?: string | null
          id?: string
          last_message_at?: string | null
          receptionist_id: string
          session_id: string
          slots?: Json | null
          topic_confidence?: number | null
        }
        Update: {
          active_flow?: string | null
          active_topic?: string | null
          created_at?: string | null
          flow_step?: string | null
          id?: string
          last_message_at?: string | null
          receptionist_id?: string
          session_id?: string
          slots?: Json | null
          topic_confidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_state_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_summaries: {
        Row: {
          created_at: string | null
          id: string
          key_facts: Json
          last_updated: string | null
          receptionist_id: string
          session_id: string
          summary: string
          user_fingerprint: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_facts?: Json
          last_updated?: string | null
          receptionist_id: string
          session_id: string
          summary: string
          user_fingerprint?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key_facts?: Json
          last_updated?: string | null
          receptionist_id?: string
          session_id?: string
          summary?: string
          user_fingerprint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_summaries_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          bot_message: string
          created_at: string
          direction: string | null
          id: string
          metadata: Json | null
          receptionist_id: string
          user_message: string
        }
        Insert: {
          bot_message: string
          created_at?: string
          direction?: string | null
          id?: string
          metadata?: Json | null
          receptionist_id: string
          user_message: string
        }
        Update: {
          bot_message?: string
          created_at?: string
          direction?: string | null
          id?: string
          metadata?: Json | null
          receptionist_id?: string
          user_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_events: {
        Row: {
          created_at: string
          currency: string | null
          event_type: string
          id: string
          metadata: Json | null
          receptionist_id: string
          revenue_value: number | null
          session_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          receptionist_id: string
          revenue_value?: number | null
          session_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          receptionist_id?: string
          revenue_value?: number | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          fingerprint: string | null
          id: string
          last_visit_at: string | null
          metadata: Json | null
          name: string
          phone: string | null
          receptionist_id: string
          updated_at: string
          visit_count: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          fingerprint?: string | null
          id?: string
          last_visit_at?: string | null
          metadata?: Json | null
          name: string
          phone?: string | null
          receptionist_id: string
          updated_at?: string
          visit_count?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          fingerprint?: string | null
          id?: string
          last_visit_at?: string | null
          metadata?: Json | null
          name?: string
          phone?: string | null
          receptionist_id?: string
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          owner_response: string | null
          reason: string
          receptionist_id: string
          resolved_at: string | null
          resolved_by: string | null
          responded_at: string | null
          session_id: string
          status: string
          summary: string | null
          urgency_source: string | null
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          owner_response?: string | null
          reason: string
          receptionist_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          session_id: string
          status?: string
          summary?: string | null
          urgency_source?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          owner_response?: string | null
          reason?: string
          receptionist_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          session_id?: string
          status?: string
          summary?: string | null
          urgency_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalations_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config_json: Json | null
          created_at: string
          enabled: boolean | null
          id: string
          type: Database["public"]["Enums"]["integration_type"]
          user_id: string
        }
        Insert: {
          config_json?: Json | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          type: Database["public"]["Enums"]["integration_type"]
          user_id: string
        }
        Update: {
          config_json?: Json | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          type?: Database["public"]["Enums"]["integration_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_rewrite_log: {
        Row: {
          auto_suggest: boolean | null
          changes: Json | null
          created_at: string | null
          id: string
          original: Json | null
          reason: string | null
          receptionist_id: string | null
          rewritten: Json | null
          user_id: string | null
        }
        Insert: {
          auto_suggest?: boolean | null
          changes?: Json | null
          created_at?: string | null
          id?: string
          original?: Json | null
          reason?: string | null
          receptionist_id?: string | null
          rewritten?: Json | null
          user_id?: string | null
        }
        Update: {
          auto_suggest?: boolean | null
          changes?: Json | null
          created_at?: string | null
          id?: string
          original?: Json | null
          reason?: string | null
          receptionist_id?: string | null
          rewritten?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_rewrite_log_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          id: string
          link: string | null
          message: string
          metadata: Json | null
          priority: string
          read: boolean
          receptionist_id: string | null
          severity: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message: string
          metadata?: Json | null
          priority?: string
          read?: boolean
          receptionist_id?: string | null
          severity?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          metadata?: Json | null
          priority?: string
          read?: boolean
          receptionist_id?: string | null
          severity?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_plans: {
        Row: {
          approved_at: string | null
          config_version_id: string | null
          created_at: string
          display_version: string
          id: string
          owner_feedback: string | null
          plan_sections: Json
          plan_text: string
          receptionist_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          config_version_id?: string | null
          created_at?: string
          display_version?: string
          id?: string
          owner_feedback?: string | null
          plan_sections?: Json
          plan_text: string
          receptionist_id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          config_version_id?: string | null
          created_at?: string
          display_version?: string
          id?: string
          owner_feedback?: string | null
          plan_sections?: Json
          plan_text?: string
          receptionist_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_plans_config_version_id_fkey"
            columns: ["config_version_id"]
            isOneToOne: false
            referencedRelation: "config_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_plans_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      optimization_log: {
        Row: {
          action: string
          created_at: string
          decision_reason: string | null
          id: string
          metadata: Json | null
          metrics_after: Json | null
          metrics_before: Json | null
          receptionist_id: string | null
          test_id: string | null
          variant_key: string | null
        }
        Insert: {
          action: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          metadata?: Json | null
          metrics_after?: Json | null
          metrics_before?: Json | null
          receptionist_id?: string | null
          test_id?: string | null
          variant_key?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          metadata?: Json | null
          metrics_after?: Json | null
          metrics_before?: Json | null
          receptionist_id?: string | null
          test_id?: string | null
          variant_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "optimization_log_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimization_log_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          notes: string | null
          receptionist_id: string
          status: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          receptionist_id: string
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          receptionist_id?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_primary: boolean | null
          metadata: Json | null
          name: string
          organization_id: string
          phone: string | null
          timezone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          name: string
          organization_id: string
          phone?: string | null
          timezone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          name?: string
          organization_id?: string
          phone?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_color: string | null
          created_at: string
          custom_domain: string | null
          id: string
          logo_url: string | null
          max_members: number | null
          max_receptionists: number | null
          metadata: Json | null
          name: string
          plan: string | null
          primary_color: string | null
          slug: string
          updated_at: string
          white_label: boolean | null
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          max_members?: number | null
          max_receptionists?: number | null
          metadata?: Json | null
          name: string
          plan?: string | null
          primary_color?: string | null
          slug: string
          updated_at?: string
          white_label?: boolean | null
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          max_members?: number | null
          max_receptionists?: number | null
          metadata?: Json | null
          name?: string
          plan?: string | null
          primary_color?: string | null
          slug?: string
          updated_at?: string
          white_label?: boolean | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          created_at: string
          currency: string
          deposit_fraction: number | null
          id: string
          order_id: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_meta: Json | null
          provider_ref: string | null
          receipt_url: string | null
          receptionist_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          deposit_fraction?: number | null
          id?: string
          order_id?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_meta?: Json | null
          provider_ref?: string | null
          receipt_url?: string | null
          receptionist_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          deposit_fraction?: number | null
          id?: string
          order_id?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_meta?: Json | null
          provider_ref?: string | null
          receipt_url?: string | null
          receptionist_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          name: string | null
          onboarding_completed: boolean | null
          plan: Database["public"]["Enums"]["user_plan"]
          timezone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          name?: string | null
          onboarding_completed?: boolean | null
          plan?: Database["public"]["Enums"]["user_plan"]
          timezone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          name?: string | null
          onboarding_completed?: boolean | null
          plan?: Database["public"]["Enums"]["user_plan"]
          timezone?: string | null
        }
        Relationships: []
      }
      quote_requests: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          quote_max: number | null
          quote_min: number | null
          quote_notes: string | null
          quote_valid_until: string | null
          receptionist_id: string
          scope_description: string | null
          service_id: string | null
          service_name: string | null
          status: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          quote_max?: number | null
          quote_min?: number | null
          quote_notes?: string | null
          quote_valid_until?: string | null
          receptionist_id: string
          scope_description?: string | null
          service_id?: string | null
          service_name?: string | null
          status?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          quote_max?: number | null
          quote_min?: number | null
          quote_notes?: string | null
          quote_valid_until?: string | null
          receptionist_id?: string
          scope_description?: string | null
          service_id?: string | null
          service_name?: string | null
          status?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      receptionist_faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          priority: number | null
          question: string
          receptionist_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          priority?: number | null
          question: string
          receptionist_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          priority?: number | null
          question?: string
          receptionist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receptionist_faqs_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      receptionists: {
        Row: {
          active: boolean | null
          additional_languages: string[] | null
          address: string | null
          ai_mode: Database["public"]["Enums"]["ai_mode"]
          allow_interruptions: boolean | null
          business_info: Json | null
          business_model: string | null
          business_name: string
          business_phone: string | null
          business_type: string | null
          capabilities: Json | null
          created_at: string
          currency: string
          customer_fields: Json | null
          default_response: string | null
          goal: string | null
          greeting_message: string | null
          hours_of_operation: Json | null
          id: string
          knowledge_base: string | null
          language: string | null
          location_id: string | null
          mock_mode: boolean | null
          model: string | null
          name: string
          organization_id: string | null
          persona_description: string | null
          phone: string | null
          primary_goal: string | null
          services_and_prices: Json | null
          system_prompt: string | null
          temperature: number | null
          timezone: string | null
          tone: Database["public"]["Enums"]["receptionist_tone"] | null
          triage_rules: Json | null
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          active?: boolean | null
          additional_languages?: string[] | null
          address?: string | null
          ai_mode?: Database["public"]["Enums"]["ai_mode"]
          allow_interruptions?: boolean | null
          business_info?: Json | null
          business_model?: string | null
          business_name: string
          business_phone?: string | null
          business_type?: string | null
          capabilities?: Json | null
          created_at?: string
          currency?: string
          customer_fields?: Json | null
          default_response?: string | null
          goal?: string | null
          greeting_message?: string | null
          hours_of_operation?: Json | null
          id?: string
          knowledge_base?: string | null
          language?: string | null
          location_id?: string | null
          mock_mode?: boolean | null
          model?: string | null
          name: string
          organization_id?: string | null
          persona_description?: string | null
          phone?: string | null
          primary_goal?: string | null
          services_and_prices?: Json | null
          system_prompt?: string | null
          temperature?: number | null
          timezone?: string | null
          tone?: Database["public"]["Enums"]["receptionist_tone"] | null
          triage_rules?: Json | null
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          active?: boolean | null
          additional_languages?: string[] | null
          address?: string | null
          ai_mode?: Database["public"]["Enums"]["ai_mode"]
          allow_interruptions?: boolean | null
          business_info?: Json | null
          business_model?: string | null
          business_name?: string
          business_phone?: string | null
          business_type?: string | null
          capabilities?: Json | null
          created_at?: string
          currency?: string
          customer_fields?: Json | null
          default_response?: string | null
          goal?: string | null
          greeting_message?: string | null
          hours_of_operation?: Json | null
          id?: string
          knowledge_base?: string | null
          language?: string | null
          location_id?: string | null
          mock_mode?: boolean | null
          model?: string | null
          name?: string
          organization_id?: string | null
          persona_description?: string | null
          phone?: string | null
          primary_goal?: string | null
          services_and_prices?: Json | null
          system_prompt?: string | null
          temperature?: number | null
          timezone?: string | null
          tone?: Database["public"]["Enums"]["receptionist_tone"] | null
          triage_rules?: Json | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receptionists_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "organization_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receptionists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receptionists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_costs: {
        Row: {
          cost_price: number | null
          created_at: string
          currency: string | null
          discount_max_percentage: number | null
          id: string
          margin_percentage: number | null
          notes: string | null
          service_id: string
          tax_rate: number | null
          updated_at: string
          wholesale_price: number | null
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          currency?: string | null
          discount_max_percentage?: number | null
          id?: string
          margin_percentage?: number | null
          notes?: string | null
          service_id: string
          tax_rate?: number | null
          updated_at?: string
          wholesale_price?: number | null
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          currency?: string | null
          discount_max_percentage?: number | null
          id?: string
          margin_percentage?: number | null
          notes?: string | null
          service_id?: string
          tax_rate?: number | null
          updated_at?: string
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_costs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_inventory: {
        Row: {
          created_at: string
          id: string
          last_restocked_at: string | null
          low_stock_threshold: number | null
          reorder_point: number | null
          service_id: string
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_restocked_at?: string | null
          low_stock_threshold?: number | null
          reorder_point?: number | null
          service_id: string
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_restocked_at?: string | null
          low_stock_threshold?: number | null
          reorder_point?: number | null
          service_id?: string
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_inventory_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_scheduling_rules: {
        Row: {
          buffer_after_minutes: number
          buffer_before_minutes: number
          cleanup_time_minutes: number | null
          created_at: string
          id: string
          max_advance_booking_days: number | null
          max_daily_bookings: number | null
          min_advance_booking_hours: number | null
          prep_time_minutes: number | null
          service_id: string
          updated_at: string
        }
        Insert: {
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          cleanup_time_minutes?: number | null
          created_at?: string
          id?: string
          max_advance_booking_days?: number | null
          max_daily_bookings?: number | null
          min_advance_booking_hours?: number | null
          prep_time_minutes?: number | null
          service_id: string
          updated_at?: string
        }
        Update: {
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          cleanup_time_minutes?: number | null
          created_at?: string
          id?: string
          max_advance_booking_days?: number | null
          max_daily_bookings?: number | null
          min_advance_booking_hours?: number | null
          prep_time_minutes?: number | null
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_scheduling_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_staff: {
        Row: {
          created_at: string | null
          duration_override_minutes: number | null
          id: string
          price_override: number | null
          priority: number | null
          receptionist_id: string
          service_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string | null
          duration_override_minutes?: number | null
          id?: string
          price_override?: number | null
          priority?: number | null
          receptionist_id: string
          service_id: string
          staff_id: string
        }
        Update: {
          created_at?: string | null
          duration_override_minutes?: number | null
          id?: string
          price_override?: number | null
          priority?: number | null
          receptionist_id?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_staff_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_staff_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean | null
          buffer_after_minutes: number
          buffer_before_minutes: number
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_product: boolean | null
          low_stock_threshold: number | null
          name: string
          price: number | null
          pricing_model: Json | null
          receptionist_id: string | null
          service_fields: Json | null
          stock_quantity: number | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_product?: boolean | null
          low_stock_threshold?: number | null
          name: string
          price?: number | null
          pricing_model?: Json | null
          receptionist_id?: string | null
          service_fields?: Json | null
          stock_quantity?: number | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          buffer_after_minutes?: number
          buffer_before_minutes?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_product?: boolean | null
          low_stock_threshold?: number | null
          name?: string
          price?: number | null
          pricing_model?: Json | null
          receptionist_id?: string | null
          service_fields?: Json | null
          stock_quantity?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          receptionist_id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          receptionist_id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          receptionist_id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          provider: string
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          provider?: string
          provider_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          provider?: string
          provider_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      success_signals: {
        Row: {
          created_at: string
          id: string
          payload: Json
          signal: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          signal: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          signal?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "success_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_logs: {
        Row: {
          cost_numeric: number | null
          created_at: string
          details: Json | null
          id: string
          metadata: Json | null
          minutes_used: number | null
          receptionist_id: string | null
          tokens_used: number | null
          usage_type: string
          user_id: string
        }
        Insert: {
          cost_numeric?: number | null
          created_at?: string
          details?: Json | null
          id?: string
          metadata?: Json | null
          minutes_used?: number | null
          receptionist_id?: string | null
          tokens_used?: number | null
          usage_type: string
          user_id: string
        }
        Update: {
          cost_numeric?: number | null
          created_at?: string
          details?: Json | null
          id?: string
          metadata?: Json | null
          minutes_used?: number | null
          receptionist_id?: string | null
          tokens_used?: number | null
          usage_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      plan_limits: {
        Row: {
          max_customers: number | null
          max_messages_monthly: number | null
          max_receptionists: number | null
          plan: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auto_detect_capabilities: {
        Args: { business_type: string }
        Returns: Json
      }
      auto_detect_primary_goal: {
        Args: { business_type: string }
        Returns: string
      }
      cleanup_old_booking_suggestions: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_old_chat_messages: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_old_conversation_state: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_old_conversations: {
        Args: { retention_days?: number }
        Returns: number
      }
      create_widget_appointment: {
        Args: {
          p_booking_source?: string
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone?: string
          p_end_time: string
          p_idempotency_key?: string
          p_metadata?: Json
          p_notes?: string
          p_receptionist_id: string
          p_service: string
          p_service_id?: string
          p_start_time: string
        }
        Returns: {
          cancellation_token: string
          confirmation_token: string
          id: string
        }[]
      }
      create_widget_order: {
        Args: {
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone?: string
          p_idempotency_key?: string
          p_items: Json
          p_metadata?: Json
          p_notes?: string
          p_receptionist_id: string
        }
        Returns: string
      }
      deduct_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: Json
      }
      get_appointment_by_token: {
        Args: { p_token: string }
        Returns: {
          booking_source: string | null
          cancellation_token: string | null
          confirmation_token: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          end_time: string
          google_event_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          notes: string | null
          receptionist_id: string
          recurrence: Json | null
          service: string
          service_field_responses: Json | null
          service_id: string | null
          staff_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"] | null
          triage_level: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_receptionist: {
        Args: { p_receptionist_id: string }
        Returns: {
          active: boolean
          business_model: string
          business_name: string
          greeting_message: string
          id: string
          name: string
          timezone: string
          tone: string
        }[]
      }
      get_safe_receptionist_for_widget: {
        Args: { p_receptionist_id: string }
        Returns: {
          business_name: string
          greeting_message: string
          id: string
          name: string
          timezone: string
          tone: string
        }[]
      }
      get_services_for_receptionist: {
        Args: { p_receptionist_id: string }
        Returns: {
          active: boolean
          buffer_after_minutes: number
          buffer_before_minutes: number
          description: string
          duration_minutes: number
          id: string
          is_product: boolean
          name: string
          price: number
          stock_quantity: number
        }[]
      }
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_booking_suggestion: {
        Args: {
          p_latency_ms?: number
          p_model?: string
          p_receptionist_id: string
          p_request_message: string
          p_suggestions: Json
        }
        Returns: string
      }
      insert_conversion_event: {
        Args: {
          p_currency?: string
          p_event_type: string
          p_metadata?: Json
          p_receptionist_id: string
          p_revenue_value?: number
          p_session_id: string
        }
        Returns: string
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      revert_config_version: {
        Args: { p_receptionist_id: string; p_target_version: number }
        Returns: Json
      }
      schedule_appointment_reminder_cron: {
        Args: { p_anon_key: string; p_supabase_url: string }
        Returns: undefined
      }
      upsert_conversation_state: {
        Args: {
          p_active_flow?: string
          p_active_topic?: string
          p_flow_step?: string
          p_receptionist_id: string
          p_session_id: string
          p_slots?: Json
          p_topic_confidence?: number
        }
        Returns: string
      }
      upsert_conversation_summary: {
        Args: {
          p_key_facts?: Json
          p_receptionist_id: string
          p_session_id: string
          p_summary: string
          p_user_fingerprint?: string
        }
        Returns: string
      }
    }
    Enums: {
      ai_mode: "support" | "booking" | "sales"
      app_role: "owner" | "admin" | "member" | "viewer"
      appointment_status: "booked" | "cancelled" | "completed"
      connector_category:
        | "messaging"
        | "social"
        | "payments"
        | "calendar"
        | "reviews"
        | "storage"
        | "ads"
        | "auth"
        | "ai"
        | "other"
      connector_status:
        | "not_configured"
        | "configured"
        | "connected"
        | "error"
        | "expired"
        | "rate_limited"
        | "deprecated"
      integration_type:
        | "twilio"
        | "openai"
        | "google_calendar"
        | "stripe"
        | "whatsapp"
        | "phone"
        | "paystack"
      payment_provider: "stripe" | "paystack"
      payment_status:
        | "pending"
        | "completed"
        | "failed"
        | "refunded"
        | "cancelled"
      receptionist_tone: "friendly" | "professional" | "playful"
      user_plan: "free" | "pro" | "enterprise"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_mode: ["support", "booking", "sales"],
      app_role: ["owner", "admin", "member", "viewer"],
      appointment_status: ["booked", "cancelled", "completed"],
      connector_category: [
        "messaging",
        "social",
        "payments",
        "calendar",
        "reviews",
        "storage",
        "ads",
        "auth",
        "ai",
        "other",
      ],
      connector_status: [
        "not_configured",
        "configured",
        "connected",
        "error",
        "expired",
        "rate_limited",
        "deprecated",
      ],
      integration_type: [
        "twilio",
        "openai",
        "google_calendar",
        "stripe",
        "whatsapp",
        "phone",
        "paystack",
      ],
      payment_provider: ["stripe", "paystack"],
      payment_status: [
        "pending",
        "completed",
        "failed",
        "refunded",
        "cancelled",
      ],
      receptionist_tone: ["friendly", "professional", "playful"],
      user_plan: ["free", "pro", "enterprise"],
    },
  },
} as const
