/**
 * Hand-written database types, mirroring `supabase/schema.sql` field for field.
 *
 * There is no Supabase CLI project or MCP server wired up here, so these are
 * maintained by hand: when a column changes, update `supabase/schema.sql`, this
 * file, and run the ALTER SQL in the Dashboard (AGENTS §7).
 */

export type SentimentLabel = "positive" | "neutral" | "negative";

/** AI-estimated political framing label (AGENTS §19). */
export type BiasLabel = "left" | "center" | "right" | "mixed" | "unclear";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      sources: {
        Row: {
          id: string;
          name: string;
          listing_url: string;
          parser_strategy: string | null;
          logo_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          listing_url: string;
          parser_strategy?: string | null;
          logo_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          listing_url?: string;
          parser_strategy?: string | null;
          logo_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      articles: {
        Row: {
          id: string;
          source_id: string;
          url: string;
          canonical_url: string | null;
          title: string;
          image_url: string;
          published_at: string;
          raw_text: string;
          scraped_at: string;
          analyzed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          url: string;
          canonical_url?: string | null;
          title: string;
          image_url: string;
          published_at: string;
          raw_text: string;
          scraped_at?: string;
          analyzed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          url?: string;
          canonical_url?: string | null;
          title?: string;
          image_url?: string;
          published_at?: string;
          raw_text?: string;
          scraped_at?: string;
          analyzed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      article_analyses: {
        Row: {
          id: string;
          article_id: string;
          summary: string;
          sentiment_score: number;
          sentiment_label: SentimentLabel;
          bias_score: number;
          bias_label: BiasLabel;
          left_percentage: number;
          center_percentage: number;
          right_percentage: number;
          confidence: number;
          framing_notes: string | null;
          loaded_terms: string[];
          disclaimer: string | null;
          model: string;
          created_at: string;
          /**
           * pgvector `vector(1536)` (§20). PostgREST moves it as its Postgres
           * literal — `"[0.1,-0.2,…]"` — so it is a string here; convert with
           * `lib/supabase/vector.ts`.
           */
          embedding: string | null;
        };
        Insert: {
          id?: string;
          article_id: string;
          summary: string;
          sentiment_score: number;
          sentiment_label: SentimentLabel;
          bias_score: number;
          bias_label: BiasLabel;
          left_percentage: number;
          center_percentage: number;
          right_percentage: number;
          confidence: number;
          framing_notes?: string | null;
          loaded_terms?: string[];
          disclaimer?: string | null;
          model: string;
          created_at?: string;
          embedding?: string | null;
        };
        Update: {
          id?: string;
          article_id?: string;
          summary?: string;
          sentiment_score?: number;
          sentiment_label?: SentimentLabel;
          bias_score?: number;
          bias_label?: BiasLabel;
          left_percentage?: number;
          center_percentage?: number;
          right_percentage?: number;
          confidence?: number;
          framing_notes?: string | null;
          loaded_terms?: string[];
          disclaimer?: string | null;
          model?: string;
          created_at?: string;
          embedding?: string | null;
        };
        Relationships: [];
      };
      logs: {
        Row: {
          id: number;
          created_at: string;
          level: LogLevel;
          event: string;
          message: string | null;
          context: Json | null;
          source_id: string | null;
          article_id: string | null;
        };
        Insert: {
          id?: never;
          created_at?: string;
          level: LogLevel;
          event: string;
          message?: string | null;
          context?: Json | null;
          source_id?: string | null;
          article_id?: string | null;
        };
        Update: {
          id?: never;
          created_at?: string;
          level?: LogLevel;
          event?: string;
          message?: string | null;
          context?: Json | null;
          source_id?: string | null;
          article_id?: string | null;
        };
        Relationships: [];
      };
      oxylabs_schedules: {
        Row: {
          id: string;
          source_id: string;
          /** Oxylabs 64-bit ID — always a string (§18). */
          schedule_id: string;
          cron_expression: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          schedule_id: string;
          cron_expression: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          schedule_id?: string;
          cron_expression?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      oxylabs_schedule_runs: {
        Row: {
          id: string;
          /** Oxylabs 64-bit ID — always a string (§18). */
          schedule_id: string;
          /** Oxylabs 64-bit job ID — always a string (§18). */
          job_id: string;
          result_status: string | null;
          run_at: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          schedule_id: string;
          job_id: string;
          result_status?: string | null;
          run_at?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          schedule_id?: string;
          job_id?: string;
          result_status?: string | null;
          run_at?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /** Related stories by cosine similarity (§20). See `supabase/schema.sql`. */
      match_related_articles: {
        Args: {
          p_article_id: string;
          /** Vector literal, per the `embedding` column note above. */
          p_embedding: string;
          p_match_count: number;
        };
        Returns: {
          article_id: string;
          title: string;
          image_url: string;
          published_at: string;
          raw_text: string;
          source_name: string;
          similarity: number;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

type Tables = Database["public"]["Tables"];

export type SourceRow = Tables["sources"]["Row"];
export type SourceInsert = Tables["sources"]["Insert"];

export type ArticleRow = Tables["articles"]["Row"];
export type ArticleInsert = Tables["articles"]["Insert"];

export type ArticleAnalysisRow = Tables["article_analyses"]["Row"];
export type ArticleAnalysisInsert = Tables["article_analyses"]["Insert"];

/**
 * An analysis row as the app reads it: everything except the 1536-float
 * `embedding`, which is never selected in bulk (§20). Similarity ordering
 * happens in Postgres, so no caller needs the vector itself.
 */
export type AnalysisWithoutEmbedding = Omit<ArticleAnalysisRow, "embedding">;

export type LogRow = Tables["logs"]["Row"];
export type LogInsert = Tables["logs"]["Insert"];

export type RelatedArticleRow =
  Database["public"]["Functions"]["match_related_articles"]["Returns"][number];

export type OxylabsScheduleRow = Tables["oxylabs_schedules"]["Row"];
export type OxylabsScheduleRunRow = Tables["oxylabs_schedule_runs"]["Row"];
