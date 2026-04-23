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
      activiteit_types: {
        Row: {
          capaciteit_type: string | null
          created_at: string | null
          id: string
          kleur_default: string | null
          min_aanwijzing_ls: string | null
          min_aanwijzing_ms: string | null
          min_personen: number | null
          min_personen_gekwalificeerd: number | null
          min_personen_totaal: number | null
          naam: string
          positie: number | null
        }
        Insert: {
          capaciteit_type?: string | null
          created_at?: string | null
          id?: string
          kleur_default?: string | null
          min_aanwijzing_ls?: string | null
          min_aanwijzing_ms?: string | null
          min_personen?: number | null
          min_personen_gekwalificeerd?: number | null
          min_personen_totaal?: number | null
          naam: string
          positie?: number | null
        }
        Update: {
          capaciteit_type?: string | null
          created_at?: string | null
          id?: string
          kleur_default?: string | null
          min_aanwijzing_ls?: string | null
          min_aanwijzing_ms?: string | null
          min_personen?: number | null
          min_personen_gekwalificeerd?: number | null
          min_personen_totaal?: number | null
          naam?: string
          positie?: number | null
        }
        Relationships: []
      }
      cel_monteurs: {
        Row: {
          cel_id: string | null
          id: string
          monteur_id: string | null
        }
        Insert: {
          cel_id?: string | null
          id?: string
          monteur_id?: string | null
        }
        Update: {
          cel_id?: string | null
          id?: string
          monteur_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cel_monteurs_cel_id_fkey"
            columns: ["cel_id"]
            isOneToOne: false
            referencedRelation: "planning_cellen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cel_monteurs_monteur_id_fkey"
            columns: ["monteur_id"]
            isOneToOne: false
            referencedRelation: "monteurs"
            referencedColumns: ["id"]
          },
        ]
      }
      monteurs: {
        Row: {
          aanwijzing_ls: string | null
          aanwijzing_ms: string | null
          actief: boolean | null
          created_at: string | null
          id: string
          naam: string
          type: string
        }
        Insert: {
          aanwijzing_ls?: string | null
          aanwijzing_ms?: string | null
          actief?: boolean | null
          created_at?: string | null
          id?: string
          naam: string
          type: string
        }
        Update: {
          aanwijzing_ls?: string | null
          aanwijzing_ms?: string | null
          actief?: boolean | null
          created_at?: string | null
          id?: string
          naam?: string
          type?: string
        }
        Relationships: []
      }
      planning_cellen: {
        Row: {
          activiteit_id: string | null
          capaciteit: number | null
          dag_index: number
          id: string
          kleur_code: string | null
          notitie: string | null
          week_id: string | null
        }
        Insert: {
          activiteit_id?: string | null
          capaciteit?: number | null
          dag_index: number
          id?: string
          kleur_code?: string | null
          notitie?: string | null
          week_id?: string | null
        }
        Update: {
          activiteit_id?: string | null
          capaciteit?: number | null
          dag_index?: number
          id?: string
          kleur_code?: string | null
          notitie?: string | null
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_cellen_activiteit_id_fkey"
            columns: ["activiteit_id"]
            isOneToOne: false
            referencedRelation: "project_activiteiten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_cellen_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "project_weken"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activiteiten: {
        Row: {
          activiteit_type_id: string | null
          capaciteit_type: string | null
          id: string
          min_aanwijzing_ls: string | null
          min_aanwijzing_ms: string | null
          min_personen: number | null
          min_personen_gekwalificeerd: number | null
          min_personen_totaal: number | null
          naam: string
          positie: number | null
          project_id: string | null
        }
        Insert: {
          activiteit_type_id?: string | null
          capaciteit_type?: string | null
          id?: string
          min_aanwijzing_ls?: string | null
          min_aanwijzing_ms?: string | null
          min_personen?: number | null
          min_personen_gekwalificeerd?: number | null
          min_personen_totaal?: number | null
          naam: string
          positie?: number | null
          project_id?: string | null
        }
        Update: {
          activiteit_type_id?: string | null
          capaciteit_type?: string | null
          id?: string
          min_aanwijzing_ls?: string | null
          min_aanwijzing_ms?: string | null
          min_personen?: number | null
          min_personen_gekwalificeerd?: number | null
          min_personen_totaal?: number | null
          naam?: string
          positie?: number | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activiteiten_activiteit_type_id_fkey"
            columns: ["activiteit_type_id"]
            isOneToOne: false
            referencedRelation: "activiteit_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activiteiten_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projecten"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          activiteit_type_ids: string[] | null
          created_at: string | null
          id: string
          naam: string
          omschrijving: string | null
          type: string
        }
        Insert: {
          activiteit_type_ids?: string[] | null
          created_at?: string | null
          id?: string
          naam: string
          omschrijving?: string | null
          type: string
        }
        Update: {
          activiteit_type_ids?: string[] | null
          created_at?: string | null
          id?: string
          naam?: string
          omschrijving?: string | null
          type?: string
        }
        Relationships: []
      }
      project_weken: {
        Row: {
          id: string
          opmerking: string | null
          positie: number
          project_id: string | null
          week_nr: number
        }
        Insert: {
          id?: string
          opmerking?: string | null
          positie: number
          project_id?: string | null
          week_nr: number
        }
        Update: {
          id?: string
          opmerking?: string | null
          positie?: number
          project_id?: string | null
          week_nr?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_weken_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projecten"
            referencedColumns: ["id"]
          },
        ]
      }
      projecten: {
        Row: {
          case_nummer: string | null
          case_type: string | null
          created_at: string | null
          gemeente: string | null
          gsu_geu: string | null
          id: string
          jaar: number | null
          ls_rek_vervangen: string | null
          ms_type: string | null
          notities: string | null
          postcode: string | null
          stad: string | null
          station_naam: string | null
          status: string | null
          straat: string | null
          template_id: string | null
          trafo_kva: string | null
          updated_at: string | null
          werkplan_lsh: boolean | null
          werkplan_lsr: boolean | null
          werkplan_msh: boolean | null
          werkplan_msr: boolean | null
          wv_naam: string | null
        }
        Insert: {
          case_nummer?: string | null
          case_type?: string | null
          created_at?: string | null
          gemeente?: string | null
          gsu_geu?: string | null
          id?: string
          jaar?: number | null
          ls_rek_vervangen?: string | null
          ms_type?: string | null
          notities?: string | null
          postcode?: string | null
          stad?: string | null
          station_naam?: string | null
          status?: string | null
          straat?: string | null
          template_id?: string | null
          trafo_kva?: string | null
          updated_at?: string | null
          werkplan_lsh?: boolean | null
          werkplan_lsr?: boolean | null
          werkplan_msh?: boolean | null
          werkplan_msr?: boolean | null
          wv_naam?: string | null
        }
        Update: {
          case_nummer?: string | null
          case_type?: string | null
          created_at?: string | null
          gemeente?: string | null
          gsu_geu?: string | null
          id?: string
          jaar?: number | null
          ls_rek_vervangen?: string | null
          ms_type?: string | null
          notities?: string | null
          postcode?: string | null
          stad?: string | null
          station_naam?: string | null
          status?: string | null
          straat?: string | null
          template_id?: string | null
          trafo_kva?: string | null
          updated_at?: string | null
          werkplan_lsh?: boolean | null
          werkplan_lsr?: boolean | null
          werkplan_msh?: boolean | null
          werkplan_msr?: boolean | null
          wv_naam?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projecten_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
