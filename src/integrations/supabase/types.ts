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
      feestdagen: {
        Row: {
          datum: string
          id: string
          jaar: number
          naam: string
        }
        Insert: {
          datum: string
          id?: string
          jaar: number
          naam: string
        }
        Update: {
          datum?: string
          id?: string
          jaar?: number
          naam?: string
        }
        Relationships: []
      }
      monteur_afwezigheid: {
        Row: {
          created_at: string | null
          datum_tot: string
          datum_van: string
          id: string
          monteur_id: string | null
          omschrijving: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          datum_tot: string
          datum_van: string
          id?: string
          monteur_id?: string | null
          omschrijving?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          datum_tot?: string
          datum_van?: string
          id?: string
          monteur_id?: string | null
          omschrijving?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "monteur_afwezigheid_monteur_id_fkey"
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
          werkdagen: number[] | null
        }
        Insert: {
          aanwijzing_ls?: string | null
          aanwijzing_ms?: string | null
          actief?: boolean | null
          created_at?: string | null
          id?: string
          naam: string
          type: string
          werkdagen?: number[] | null
        }
        Update: {
          aanwijzing_ls?: string | null
          aanwijzing_ms?: string | null
          actief?: boolean | null
          created_at?: string | null
          id?: string
          naam?: string
          type?: string
          werkdagen?: number[] | null
        }
        Relationships: []
      }
      opdrachtgevers: {
        Row: {
          created_at: string | null
          id: string
          naam: string
          positie: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          naam: string
          positie?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          naam?: string
          positie?: number | null
        }
        Relationships: []
      }
      percelen: {
        Row: {
          created_at: string | null
          id: string
          naam: string
          positie: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          naam: string
          positie?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          naam?: string
          positie?: number | null
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
      project_ls_kabels: {
        Row: {
          created_at: string | null
          diameter: string | null
          id: string
          positie: number
          project_id: string
          soort: string
        }
        Insert: {
          created_at?: string | null
          diameter?: string | null
          id?: string
          positie?: number
          project_id: string
          soort?: string
        }
        Update: {
          created_at?: string | null
          diameter?: string | null
          id?: string
          positie?: number
          project_id?: string
          soort?: string
        }
        Relationships: []
      }
      project_ms_kabels: {
        Row: {
          created_at: string | null
          diameter: string | null
          id: string
          positie: number
          project_id: string
          soort: string
        }
        Insert: {
          created_at?: string | null
          diameter?: string | null
          id?: string
          positie?: number
          project_id: string
          soort?: string
        }
        Update: {
          created_at?: string | null
          diameter?: string | null
          id?: string
          positie?: number
          project_id?: string
          soort?: string
        }
        Relationships: []
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
          created_at: string | null
          def_aantal_ms_richtingen: number | null
          def_aardelektrode: string | null
          def_aardmeting: string | null
          def_flex_ov_nieuw: string | null
          def_ggi_aantal: number | null
          def_ggi_nieuw: string | null
          def_ls_aantal_stroken_herschikken: number | null
          def_ls_situatie: string | null
          def_ombouw_ims: string | null
          def_opleverdossier: string | null
          def_ov_kwh_meter_nieuw: string | null
          def_rmu_merk_configuratie: string | null
          def_rmu_vervangen: string | null
          def_trafo_gedraaid: string | null
          def_trafo_type: string | null
          def_trafo_vervangen: string | null
          def_vereffening_vernieuwen: string | null
          def_vermogensveld: string | null
          def_zekeringen_wisselen: string | null
          gemeente: string | null
          geu_datum: string | null
          gsu_datum: string | null
          gsu_geu: string | null
          huidig_flex_ov_aanwezig: string | null
          huidig_kabels_herbruikbaar: string | null
          huidig_ls_kabels_aantal: number | null
          huidig_ls_kabels_aanwezig: string | null
          huidig_ls_kabels_type: string | null
          huidig_lsrek_aanwezig: string | null
          huidig_lsrek_type: string | null
          huidig_ms_kabels_aantal: number | null
          huidig_ms_kabels_aanwezig: string | null
          huidig_ms_kabels_type: string | null
          huidig_ov_kwh_meter: string | null
          huidig_rmu_aantal_richtingen: number | null
          huidig_rmu_type: string | null
          huidig_trafo_aanwezig: string | null
          huidig_trafo_type: string | null
          huidig_vermogensveld: string | null
          id: string
          jaar: number | null
          locatie: string | null
          notities: string | null
          nsa_luik_aanwezig: string | null
          opdrachtgever_id: string | null
          perceel_id: string | null
          postcode: string | null
          prov_ls_eindsluitingen_aantal: number | null
          prov_ls_moffen_aantal: number | null
          prov_ms_eindsluitingen_aantal: number | null
          prov_ms_eindsluitingen_type: string | null
          prov_ms_moffen_aantal: number | null
          prov_tijdelijke_lskast: string | null
          stad: string | null
          station_naam: string | null
          status: string | null
          straat: string | null
          template_id: string | null
          tijdelijke_situatie: string | null
          updated_at: string | null
          wv_naam: string | null
        }
        Insert: {
          case_nummer?: string | null
          created_at?: string | null
          def_aantal_ms_richtingen?: number | null
          def_aardelektrode?: string | null
          def_aardmeting?: string | null
          def_flex_ov_nieuw?: string | null
          def_ggi_aantal?: number | null
          def_ggi_nieuw?: string | null
          def_ls_aantal_stroken_herschikken?: number | null
          def_ls_situatie?: string | null
          def_ombouw_ims?: string | null
          def_opleverdossier?: string | null
          def_ov_kwh_meter_nieuw?: string | null
          def_rmu_merk_configuratie?: string | null
          def_rmu_vervangen?: string | null
          def_trafo_gedraaid?: string | null
          def_trafo_type?: string | null
          def_trafo_vervangen?: string | null
          def_vereffening_vernieuwen?: string | null
          def_vermogensveld?: string | null
          def_zekeringen_wisselen?: string | null
          gemeente?: string | null
          geu_datum?: string | null
          gsu_datum?: string | null
          gsu_geu?: string | null
          huidig_flex_ov_aanwezig?: string | null
          huidig_kabels_herbruikbaar?: string | null
          huidig_ls_kabels_aantal?: number | null
          huidig_ls_kabels_aanwezig?: string | null
          huidig_ls_kabels_type?: string | null
          huidig_lsrek_aanwezig?: string | null
          huidig_lsrek_type?: string | null
          huidig_ms_kabels_aantal?: number | null
          huidig_ms_kabels_aanwezig?: string | null
          huidig_ms_kabels_type?: string | null
          huidig_ov_kwh_meter?: string | null
          huidig_rmu_aantal_richtingen?: number | null
          huidig_rmu_type?: string | null
          huidig_trafo_aanwezig?: string | null
          huidig_trafo_type?: string | null
          huidig_vermogensveld?: string | null
          id?: string
          jaar?: number | null
          locatie?: string | null
          notities?: string | null
          nsa_luik_aanwezig?: string | null
          opdrachtgever_id?: string | null
          perceel_id?: string | null
          postcode?: string | null
          prov_ls_eindsluitingen_aantal?: number | null
          prov_ls_moffen_aantal?: number | null
          prov_ms_eindsluitingen_aantal?: number | null
          prov_ms_eindsluitingen_type?: string | null
          prov_ms_moffen_aantal?: number | null
          prov_tijdelijke_lskast?: string | null
          stad?: string | null
          station_naam?: string | null
          status?: string | null
          straat?: string | null
          template_id?: string | null
          tijdelijke_situatie?: string | null
          updated_at?: string | null
          wv_naam?: string | null
        }
        Update: {
          case_nummer?: string | null
          created_at?: string | null
          def_aantal_ms_richtingen?: number | null
          def_aardelektrode?: string | null
          def_aardmeting?: string | null
          def_flex_ov_nieuw?: string | null
          def_ggi_aantal?: number | null
          def_ggi_nieuw?: string | null
          def_ls_aantal_stroken_herschikken?: number | null
          def_ls_situatie?: string | null
          def_ombouw_ims?: string | null
          def_opleverdossier?: string | null
          def_ov_kwh_meter_nieuw?: string | null
          def_rmu_merk_configuratie?: string | null
          def_rmu_vervangen?: string | null
          def_trafo_gedraaid?: string | null
          def_trafo_type?: string | null
          def_trafo_vervangen?: string | null
          def_vereffening_vernieuwen?: string | null
          def_vermogensveld?: string | null
          def_zekeringen_wisselen?: string | null
          gemeente?: string | null
          geu_datum?: string | null
          gsu_datum?: string | null
          gsu_geu?: string | null
          huidig_flex_ov_aanwezig?: string | null
          huidig_kabels_herbruikbaar?: string | null
          huidig_ls_kabels_aantal?: number | null
          huidig_ls_kabels_aanwezig?: string | null
          huidig_ls_kabels_type?: string | null
          huidig_lsrek_aanwezig?: string | null
          huidig_lsrek_type?: string | null
          huidig_ms_kabels_aantal?: number | null
          huidig_ms_kabels_aanwezig?: string | null
          huidig_ms_kabels_type?: string | null
          huidig_ov_kwh_meter?: string | null
          huidig_rmu_aantal_richtingen?: number | null
          huidig_rmu_type?: string | null
          huidig_trafo_aanwezig?: string | null
          huidig_trafo_type?: string | null
          huidig_vermogensveld?: string | null
          id?: string
          jaar?: number | null
          locatie?: string | null
          notities?: string | null
          nsa_luik_aanwezig?: string | null
          opdrachtgever_id?: string | null
          perceel_id?: string | null
          postcode?: string | null
          prov_ls_eindsluitingen_aantal?: number | null
          prov_ls_moffen_aantal?: number | null
          prov_ms_eindsluitingen_aantal?: number | null
          prov_ms_eindsluitingen_type?: string | null
          prov_ms_moffen_aantal?: number | null
          prov_tijdelijke_lskast?: string | null
          stad?: string | null
          station_naam?: string | null
          status?: string | null
          straat?: string | null
          template_id?: string | null
          tijdelijke_situatie?: string | null
          updated_at?: string | null
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
