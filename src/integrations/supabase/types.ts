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
      appointments: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string | null
          end_time: string
          id: string
          notes: string | null
          receptionist_id: string
          service: string
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"] | null
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          end_time: string
          id?: string
          notes?: string | null
          receptionist_id: string
          service: string
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          receptionist_id?: string
          service?: string
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
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          receptionist_id: string
          sender: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          receptionist_id: string
          sender: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          receptionist_id?: string
          sender?: string
          user_id?: string
        }
        Relationships: []
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
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          onboarding_completed: boolean | null
          plan: Database["public"]["Enums"]["user_plan"]
          timezone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name?: string | null
          onboarding_completed?: boolean | null
          plan?: Database["public"]["Enums"]["user_plan"]
          timezone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
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
        ]
      }
      receptionists: {
        Row: {
          active: boolean | null
          additional_languages: string[] | null
          address: string | null
          allow_interruptions: boolean | null
          business_info: Json | null
          business_name: string
          business_phone: string | null
          business_type: string | null
          created_at: string
          default_response: string | null
          goal: string | null
          greeting_message: string | null
          hours_of_operation: Json | null
          id: string
          knowledge_base: string | null
          language: string | null
          mock_mode: boolean | null
          name: string
          persona_description: string | null
          phone: string | null
          services_and_prices: Json | null
          system_prompt: string | null
          temperature: number | null
          timezone: string | null
          tone: Database["public"]["Enums"]["receptionist_tone"] | null
          user_id: string
          website: string | null
        }
        Insert: {
          active?: boolean | null
          additional_languages?: string[] | null
          address?: string | null
          allow_interruptions?: boolean | null
          business_info?: Json | null
          business_name: string
          business_phone?: string | null
          business_type?: string | null
          created_at?: string
          default_response?: string | null
          goal?: string | null
          greeting_message?: string | null
          hours_of_operation?: Json | null
          id?: string
          knowledge_base?: string | null
          language?: string | null
          mock_mode?: boolean | null
          name: string
          persona_description?: string | null
          phone?: string | null
          services_and_prices?: Json | null
          system_prompt?: string | null
          temperature?: number | null
          timezone?: string | null
          tone?: Database["public"]["Enums"]["receptionist_tone"] | null
          user_id: string
          website?: string | null
        }
        Update: {
          active?: boolean | null
          additional_languages?: string[] | null
          address?: string | null
          allow_interruptions?: boolean | null
          business_info?: Json | null
          business_name?: string
          business_phone?: string | null
          business_type?: string | null
          created_at?: string
          default_response?: string | null
          goal?: string | null
          greeting_message?: string | null
          hours_of_operation?: Json | null
          id?: string
          knowledge_base?: string | null
          language?: string | null
          mock_mode?: boolean | null
          name?: string
          persona_description?: string | null
          phone?: string | null
          services_and_prices?: Json | null
          system_prompt?: string | null
          temperature?: number | null
          timezone?: string | null
          tone?: Database["public"]["Enums"]["receptionist_tone"] | null
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
      usage_logs: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          minutes_used: number | null
          usage_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          minutes_used?: number | null
          usage_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          minutes_used?: number | null
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
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
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
      appointment_status: ["booked", "cancelled", "completed"],
      integration_type: ["twilio", "openai", "google_calendar", "stripe"],
      receptionist_tone: ["friendly", "professional", "playful"],
      user_plan: ["free", "pro", "enterprise"],
    },
  },
} as const
