export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      bancas: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      concursos: {
        Row: {
          banca_id: string | null
          created_at: string
          id: string
          nome: string
          orgao: string | null
        }
        Insert: {
          banca_id?: string | null
          created_at?: string
          id?: string
          nome: string
          orgao?: string | null
        }
        Update: {
          banca_id?: string | null
          created_at?: string
          id?: string
          nome?: string
          orgao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concursos_banca_id_fkey"
            columns: ["banca_id"]
            isOneToOne: false
            referencedRelation: "bancas"
            referencedColumns: ["id"]
          },
        ]
      }
      materias: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      provas: {
        Row: {
          ano: number | null
          arquivo_hash: string | null
          arquivo_path: string | null
          cargo: string | null
          concurso_id: string
          created_at: string
          erro_msg: string | null
          gabarito_path: string | null
          id: string
          nome: string
          processando_desde: string | null
          status: string
          total_questoes: number | null
        }
        Insert: {
          ano?: number | null
          arquivo_hash?: string | null
          arquivo_path?: string | null
          cargo?: string | null
          concurso_id: string
          created_at?: string
          erro_msg?: string | null
          gabarito_path?: string | null
          id?: string
          nome: string
          processando_desde?: string | null
          status?: string
          total_questoes?: number | null
        }
        Update: {
          ano?: number | null
          arquivo_hash?: string | null
          arquivo_path?: string | null
          cargo?: string | null
          concurso_id?: string
          created_at?: string
          erro_msg?: string | null
          gabarito_path?: string | null
          id?: string
          nome?: string
          processando_desde?: string | null
          status?: string
          total_questoes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provas_concurso_id_fkey"
            columns: ["concurso_id"]
            isOneToOne: false
            referencedRelation: "concursos"
            referencedColumns: ["id"]
          },
        ]
      }
      questoes: {
        Row: {
          alternativas: Json
          anulada: boolean
          assunto: string | null
          comentario: string | null
          created_at: string
          enunciado: string
          gabarito: string | null
          id: string
          imagem_path: string | null
          incerto: boolean
          materia_id: string | null
          numero: number | null
          prova_id: string
          revisada: boolean
          tem_imagem: boolean
          tipo: string
          updated_at: string
        }
        Insert: {
          alternativas: Json
          anulada?: boolean
          assunto?: string | null
          comentario?: string | null
          created_at?: string
          enunciado: string
          gabarito?: string | null
          id?: string
          imagem_path?: string | null
          incerto?: boolean
          materia_id?: string | null
          numero?: number | null
          prova_id: string
          revisada?: boolean
          tem_imagem?: boolean
          tipo: string
          updated_at?: string
        }
        Update: {
          alternativas?: Json
          anulada?: boolean
          assunto?: string | null
          comentario?: string | null
          created_at?: string
          enunciado?: string
          gabarito?: string | null
          id?: string
          imagem_path?: string | null
          incerto?: boolean
          materia_id?: string | null
          numero?: number | null
          prova_id?: string
          revisada?: boolean
          tem_imagem?: boolean
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questoes_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questoes_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas: {
        Row: {
          acertou: boolean
          id: string
          letra_marcada: string
          questao_id: string
          quiz_sessao_id: string | null
          respondido_em: string
        }
        Insert: {
          acertou: boolean
          id?: string
          letra_marcada: string
          questao_id: string
          quiz_sessao_id?: string | null
          respondido_em?: string
        }
        Update: {
          acertou?: boolean
          id?: string
          letra_marcada?: string
          questao_id?: string
          quiz_sessao_id?: string | null
          respondido_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "respostas_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_questao_id_fkey"
            columns: ["questao_id"]
            isOneToOne: false
            referencedRelation: "questoes_completas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      questoes_completas: {
        Row: {
          alternativas: Json | null
          anulada: boolean | null
          assunto: string | null
          banca_id: string | null
          banca_nome: string | null
          comentario: string | null
          concurso_id: string | null
          concurso_nome: string | null
          created_at: string | null
          elegivel: boolean | null
          enunciado: string | null
          gabarito: string | null
          id: string | null
          imagem_path: string | null
          incerto: boolean | null
          materia: string | null
          materia_id: string | null
          numero: number | null
          prova_ano: number | null
          prova_id: string | null
          prova_nome: string | null
          revisada: boolean | null
          tem_imagem: boolean | null
          tipo: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concursos_banca_id_fkey"
            columns: ["banca_id"]
            isOneToOne: false
            referencedRelation: "bancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provas_concurso_id_fkey"
            columns: ["concurso_id"]
            isOneToOne: false
            referencedRelation: "concursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questoes_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questoes_prova_id_fkey"
            columns: ["prova_id"]
            isOneToOne: false
            referencedRelation: "provas"
            referencedColumns: ["id"]
          },
        ]
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

