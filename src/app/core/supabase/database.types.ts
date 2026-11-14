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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string
          created_by: string
          external_id: string | null
          external_url: string | null
          height: number | null
          id: string
          mime_type: string
          size_bytes: number
          source: Database["public"]["Enums"]["asset_source"]
          storage_path: string | null
          width: number | null
          world_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          external_id?: string | null
          external_url?: string | null
          height?: number | null
          id?: string
          mime_type: string
          size_bytes?: number
          source: Database["public"]["Enums"]["asset_source"]
          storage_path?: string | null
          width?: number | null
          world_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          external_id?: string | null
          external_url?: string | null
          height?: number | null
          id?: string
          mime_type?: string
          size_bytes?: number
          source?: Database["public"]["Enums"]["asset_source"]
          storage_path?: string | null
          width?: number | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      calendars: {
        Row: {
          definition: Json
          updated_at: string
          world_id: string
        }
        Insert: {
          definition: Json
          updated_at?: string
          world_id: string
        }
        Update: {
          definition?: Json
          updated_at?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendars_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: true
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          aliases: string[]
          attributes: Json
          born_tick: number | null
          color: string | null
          content: Json | null
          content_text: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          died_tick: number | null
          id: string
          kind: string
          name: string
          portrait_asset_id: string | null
          search: unknown
          subtitle: string | null
          tags: string[]
          updated_at: string
          version: number
          world_id: string
        }
        Insert: {
          aliases?: string[]
          attributes?: Json
          born_tick?: number | null
          color?: string | null
          content?: Json | null
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          died_tick?: number | null
          id?: string
          kind: string
          name: string
          portrait_asset_id?: string | null
          search?: unknown
          subtitle?: string | null
          tags?: string[]
          updated_at?: string
          version?: number
          world_id: string
        }
        Update: {
          aliases?: string[]
          attributes?: Json
          born_tick?: number | null
          color?: string | null
          content?: Json | null
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          died_tick?: number | null
          id?: string
          kind?: string
          name?: string
          portrait_asset_id?: string | null
          search?: unknown
          subtitle?: string | null
          tags?: string[]
          updated_at?: string
          version?: number
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_portrait_asset_id_fkey"
            columns: ["portrait_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_mentions: {
        Row: {
          source_id: string
          source_kind: string
          target_entity_id: string
          world_id: string
        }
        Insert: {
          source_id: string
          source_kind: string
          target_entity_id: string
          world_id: string
        }
        Update: {
          source_id?: string
          source_kind?: string
          target_entity_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_mentions_target_entity_id_fkey"
            columns: ["target_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_mentions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_relations: {
        Row: {
          from_id: string
          id: string
          relation: string
          tick_end: number | null
          tick_start: number | null
          to_id: string
          world_id: string
        }
        Insert: {
          from_id: string
          id?: string
          relation: string
          tick_end?: number | null
          tick_start?: number | null
          to_id: string
          world_id: string
        }
        Update: {
          from_id?: string
          id?: string
          relation?: string
          tick_end?: number | null
          tick_start?: number | null
          to_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relations_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relations_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relations_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          entity_id: string
          event_id: string
          role: string | null
          world_id: string
        }
        Insert: {
          entity_id: string
          event_id: string
          role?: string | null
          world_id: string
        }
        Update: {
          entity_id?: string
          event_id?: string
          role?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string
          color: string | null
          content: Json | null
          content_text: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          location_entity_id: string | null
          search: unknown
          tick_end: number | null
          tick_start: number
          title: string
          updated_at: string
          version: number
          world_id: string
        }
        Insert: {
          category?: string
          color?: string | null
          content?: Json | null
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          location_entity_id?: string | null
          search?: unknown
          tick_end?: number | null
          tick_start: number
          title: string
          updated_at?: string
          version?: number
          world_id: string
        }
        Update: {
          category?: string
          color?: string | null
          content?: Json | null
          content_text?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          location_entity_id?: string | null
          search?: unknown
          tick_end?: number | null
          tick_start?: number
          title?: string
          updated_at?: string
          version?: number
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_entity_id_fkey"
            columns: ["location_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      external_links: {
        Row: {
          created_at: string
          entity_id: string | null
          event_id: string | null
          external_id: string | null
          icon_url: string | null
          id: string
          linked_by: string
          mime_type: string | null
          name: string
          provider: string
          purpose: string
          revision_id: string | null
          search_text: string | null
          sort_order: number
          web_view_link: string | null
          world_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          event_id?: string | null
          external_id?: string | null
          icon_url?: string | null
          id?: string
          linked_by: string
          mime_type?: string | null
          name: string
          provider: string
          purpose?: string
          revision_id?: string | null
          search_text?: string | null
          sort_order?: number
          web_view_link?: string | null
          world_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          event_id?: string | null
          external_id?: string | null
          icon_url?: string | null
          id?: string
          linked_by?: string
          mime_type?: string | null
          name?: string
          provider?: string
          purpose?: string
          revision_id?: string | null
          search_text?: string | null
          sort_order?: number
          web_view_link?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_links_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_links_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      map_annotations: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string | null
          event_id: string | null
          geometry: Json
          id: string
          kind: string
          map_id: string
          style: Json
          tick_end: number | null
          tick_start: number | null
          title: string | null
          updated_at: string
          version: number
          world_id: string
          z_index: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          event_id?: string | null
          geometry: Json
          id?: string
          kind: string
          map_id: string
          style?: Json
          tick_end?: number | null
          tick_start?: number | null
          title?: string | null
          updated_at?: string
          version?: number
          world_id: string
          z_index?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          event_id?: string | null
          geometry?: Json
          id?: string
          kind?: string
          map_id?: string
          style?: Json
          tick_end?: number | null
          tick_start?: number | null
          title?: string | null
          updated_at?: string
          version?: number
          world_id?: string
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_annotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_annotations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_annotations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_annotations_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_annotations_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      map_image_versions: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          image_asset_id: string | null
          map_id: string
          tick_start: number
          updated_at: string
          version: number
          world_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          image_asset_id?: string | null
          map_id: string
          tick_start: number
          updated_at?: string
          version?: number
          world_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          image_asset_id?: string | null
          map_id?: string
          tick_start?: number
          updated_at?: string
          version?: number
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_image_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_image_versions_image_asset_id_fkey"
            columns: ["image_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_image_versions_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_image_versions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      map_links: {
        Row: {
          id: string
          map_id: string
          polygon: Json
          target_map_id: string
          world_id: string
        }
        Insert: {
          id?: string
          map_id: string
          polygon: Json
          target_map_id: string
          world_id: string
        }
        Update: {
          id?: string
          map_id?: string
          polygon?: Json
          target_map_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_links_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_links_target_map_id_fkey"
            columns: ["target_map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_links_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      map_tokens: {
        Row: {
          created_at: string
          entity_id: string | null
          event_id: string | null
          id: string
          map_id: string
          size: number
          style: Json
          world_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          event_id?: string | null
          id?: string
          map_id: string
          size?: number
          style?: Json
          world_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          event_id?: string | null
          id?: string
          map_id?: string
          size?: number
          style?: Json
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_tokens_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_tokens_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_tokens_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_tokens_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      maps: {
        Row: {
          created_at: string
          deleted_at: string | null
          height: number
          id: string
          image_asset_id: string | null
          name: string
          parent_map_id: string | null
          scale_label: string | null
          scale_unit: string | null
          scale_value: number | null
          sort_order: number
          updated_at: string
          version: number
          width: number
          world_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          height: number
          id?: string
          image_asset_id?: string | null
          name: string
          parent_map_id?: string | null
          scale_label?: string | null
          scale_unit?: string | null
          scale_value?: number | null
          sort_order?: number
          updated_at?: string
          version?: number
          width: number
          world_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          height?: number
          id?: string
          image_asset_id?: string | null
          name?: string
          parent_map_id?: string | null
          scale_label?: string | null
          scale_unit?: string | null
          scale_value?: number | null
          sort_order?: number
          updated_at?: string
          version?: number
          width?: number
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maps_image_asset_id_fkey"
            columns: ["image_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maps_parent_map_id_fkey"
            columns: ["parent_map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maps_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          id: string
          locale: string
          ui_prefs: Json
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name: string
          id: string
          locale?: string
          ui_prefs?: Json
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id?: string
          locale?: string
          ui_prefs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      token_keyframes: {
        Row: {
          id: string
          interpolation: Database["public"]["Enums"]["interp_mode"]
          note: string | null
          tick: number
          token_id: string
          updated_at: string
          visible: boolean
          world_id: string
          x: number
          y: number
        }
        Insert: {
          id?: string
          interpolation?: Database["public"]["Enums"]["interp_mode"]
          note?: string | null
          tick: number
          token_id: string
          updated_at?: string
          visible?: boolean
          world_id: string
          x: number
          y: number
        }
        Update: {
          id?: string
          interpolation?: Database["public"]["Enums"]["interp_mode"]
          note?: string | null
          tick?: number
          token_id?: string
          updated_at?: string
          visible?: boolean
          world_id?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "token_keyframes_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "map_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_keyframes_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      world_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          world_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          world_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_members_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      worlds: {
        Row: {
          archived_at: string | null
          cover_asset_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          now_tick: number | null
          owner_id: string
          time_end: number
          time_start: number
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          cover_asset_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          now_tick?: number | null
          owner_id: string
          time_end?: number
          time_start?: number
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          cover_asset_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          now_tick?: number | null
          owner_id?: string
          time_end?: number
          time_start?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "worlds_cover_asset_id_fkey"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worlds_owner_id_fkey"
            columns: ["owner_id"]
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
      can_edit_world: { Args: { p_world_id: string }; Returns: boolean }
      can_read_world: { Args: { p_world_id: string }; Returns: boolean }
      shares_world_with: { Args: { p_user_id: string }; Returns: boolean }
      wd_unaccent: { Args: { p_text: string }; Returns: string }
      world_role: {
        Args: { p_world_id: string }
        Returns: Database["public"]["Enums"]["member_role"]
      }
    }
    Enums: {
      asset_source: "storage" | "google_drive" | "external_url"
      interp_mode: "linear" | "step" | "ease"
      member_role: "owner" | "editor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      asset_source: ["storage", "google_drive", "external_url"],
      interp_mode: ["linear", "step", "ease"],
      member_role: ["owner", "editor"],
    },
  },
} as const
