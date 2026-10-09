export type Category =
  "flood" | "fire" | "medical" | "infrastructure" | "crime" | "unknown";
export type Level = "high" | "medium" | "low";
export interface Extraction {
  incident_type: Category;
  language: string;
  location_text: string | null;
  people_affected: number | null;
  people_trapped: boolean | null;
  medical_help_needed: boolean | null;
  requested_assistance: string[];
  summary: string;
  uncertainties: string[];
  evidence_spans: string[];
  extraction_status: string;
}
export interface Media {
  id: string;
  kind: "image" | "audio";
  url: string;
  transcript?: string;
}
export interface Report {
  category?: Category | null;
  id: string;
  text: string;
  language: string;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  occurred_at: string | null;
  created_at: string;
  synthetic: boolean;
  review_status: string;
  extraction: Extraction;
  engine: string;
  latency_ms: number;
  incident_id: string;
  media: Media[];
}
export interface Activity {
  id: string;
  action: string;
  entity_id: string;
  created_at: string;
  detail: Record<string, unknown>;
}
export interface Incident {
  id: string;
  incident_type: Category;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  summary: string;
  status: string;
  report_count: number;
  synthetic: boolean;
  languages: string[];
  created_at: string;
  priority: {
    level: Level;
    score: number;
    reasons: { label: string; points: number; report_ids: string[] }[];
    uncertainties: string[];
  };
  reports?: Report[];
  history?: Activity[];
}
export interface Match {
  id: string;
  report_id: string;
  incident_id: string;
  score: number;
  status: string;
  report: Report;
  incident: Incident;
  factors: {
    geographic: number;
    category: number;
    text: number;
    time: number;
    distance_km: number | null;
    hours_apart: number | null;
    uncertainties: string[];
  };
}
export interface Summary {
  total_reports: number;
  unique_incidents: number;
  awaiting_review: number;
  high_priority: number;
  pending_matches: number;
  synthetic_reports: number;
  types: { name: string; value: number }[];
  languages: { name: string; value: number }[];
  volume: { time: string; reports: number }[];
  engines: Record<string, number>;
  activity: Activity[];
}
export interface Health {
  status: string;
  database: string;
  deployment: string;
  ai_mode: string;
  ollama_reachable: boolean;
  model: string;
  model_available: boolean;
  effective_engine: string;
  voice_enabled: boolean;
  voice_installed: boolean;
  whisper_model: string;
  match_threshold: number;
}
