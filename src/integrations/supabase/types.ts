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
    PostgrestVersion: "13.0.5"
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
          {
            foreignKeyName: "ai_booking_suggestions_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "ai_responses_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
            foreignKeyName: "analytics_cache_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "appointment_slots_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          customer_name: string
          customer_phone: string | null
          end_time: string
          google_event_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          notes: string | null
          receptionist_id: string
          service: string
          service_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"] | null
        }
        Insert: {
          booking_source?: string | null
          cancellation_token?: string | null
          confirmation_token?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          end_time: string
          google_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          receptionist_id: string
          service: string
          service_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
        }
        Update: {
          booking_source?: string | null
          cancellation_token?: string | null
          confirmation_token?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          end_time?: string
          google_event_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          receptionist_id?: string
          service?: string
          service_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
          {
            foreignKeyName: "availability_exceptions_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
            foreignKeyName: "availability_rules_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "conversation_state_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "conversation_summaries_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "conversations_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "conversion_events_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "kb_rewrite_log_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "notifications_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
            foreignKeyName: "optimization_log_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          customer_name: string
          customer_phone: string | null
          id: string
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
          customer_name: string
          customer_phone?: string | null
          id?: string
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
          customer_name?: string
          customer_phone?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          receptionist_id?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          {
            foreignKeyName: "receptionist_faqs_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
          default_response: string | null
          goal: string | null
          greeting_message: string | null
          hours_of_operation: Json | null
          id: string
          knowledge_base: string | null
          language: string | null
          mock_mode: boolean | null
          model: string | null
          name: string
          persona_description: string | null
          phone: string | null
          primary_goal: string | null
          services_and_prices: Json | null
          system_prompt: string | null
          temperature: number | null
          timezone: string | null
          tone: Database["public"]["Enums"]["receptionist_tone"] | null
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
          default_response?: string | null
          goal?: string | null
          greeting_message?: string | null
          hours_of_operation?: Json | null
          id?: string
          knowledge_base?: string | null
          language?: string | null
          mock_mode?: boolean | null
          model?: string | null
          name: string
          persona_description?: string | null
          phone?: string | null
          primary_goal?: string | null
          services_and_prices?: Json | null
          system_prompt?: string | null
          temperature?: number | null
          timezone?: string | null
          tone?: Database["public"]["Enums"]["receptionist_tone"] | null
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
          default_response?: string | null
          goal?: string | null
          greeting_message?: string | null
          hours_of_operation?: Json | null
          id?: string
          knowledge_base?: string | null
          language?: string | null
          mock_mode?: boolean | null
          model?: string | null
          name?: string
          persona_description?: string | null
          phone?: string | null
          primary_goal?: string | null
          services_and_prices?: Json | null
          system_prompt?: string | null
          temperature?: number | null
          timezone?: string | null
          tone?: Database["public"]["Enums"]["receptionist_tone"] | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receptionists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          receptionist_id: string | null
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
          receptionist_id?: string | null
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
          receptionist_id?: string | null
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
          {
            foreignKeyName: "services_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
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
    }
    Views: {
      revenue_attribution: {
        Row: {
          bookings_count: number | null
          checkouts_count: number | null
          currency: string | null
          leads_count: number | null
          orders_count: number | null
          receptionist_id: string | null
          total_revenue_assisted: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "receptionists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_events_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "widget_receptionists"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_receptionists: {
        Row: {
          business_name: string | null
          greeting_message: string | null
          id: string | null
          name: string | null
          timezone: string | null
          tone: Database["public"]["Enums"]["receptionist_tone"] | null
        }
        Insert: {
          business_name?: string | null
          greeting_message?: string | null
          id?: string | null
          name?: string | null
          timezone?: string | null
          tone?: Database["public"]["Enums"]["receptionist_tone"] | null
        }
        Update: {
          business_name?: string | null
          greeting_message?: string | null
          id?: string | null
          name?: string | null
          timezone?: string | null
          tone?: Database["public"]["Enums"]["receptionist_tone"] | null
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
      get_public_receptionist: {
        Args: { p_receptionist_id: string }
        Returns: {
          active: boolean
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
    }
    Enums: {
      ai_mode: "support" | "booking" | "sales"
      appointment_status: "booked" | "cancelled" | "completed"
      integration_type: "twilio" | "openai" | "google_calendar" | "stripe"
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
  public: {
    Enums: {
      ai_mode: ["support", "booking", "sales"],
      appointment_status: ["booked", "cancelled", "completed"],
      integration_type: ["twilio", "openai", "google_calendar", "stripe"],
      receptionist_tone: ["friendly", "professional", "playful"],
      user_plan: ["free", "pro", "enterprise"],
    },
  },
} as const
