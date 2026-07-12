// src/types.ts
// TypeScript interfaces และ types สำหรับทั้งโปรเจกต์

// ─── Google OAuth ────────────────────────────────────────────────────────────

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// ─── Google Fit API ──────────────────────────────────────────────────────────

export interface DataPoint {
  startTimeNanos: string;
  endTimeNanos: string;
  dataTypeName: string;
  value: Array<{
    intVal?: number;
    fpVal?: number;
    mapVal?: Array<{ key: string; value: { fpVal?: number; intVal?: number } }>;
  }>;
}

export interface AggregateResponse {
  bucket: Array<{
    startTimeMillis: string;
    endTimeMillis: string;
    dataset: Array<{
      dataSourceId: string;
      point: DataPoint[];
    }>;
  }>;
}

export interface SleepSession {
  id: string;
  name: string;
  description: string;
  startTimeMillis: string;
  endTimeMillis: string;
  activityType: number;
  application: { name: string };
  segments: Array<{
    startTimeMillis: string;
    endTimeMillis: string;
    sleepStage: number;
  }>;
}

export interface SleepSessionsResponse {
  session: SleepSession[];
}

// ─── Health Summary ──────────────────────────────────────────────────────────

/** ข้อมูลสุขภาพรวมที่ดึงมาจาก Google Fit */
export interface HealthData {
  date: string;                   // วันที่ เช่น "2024-07-11"
  steps: number;                  // จำนวนก้าว
  stepGoalPercent: number;        // เปอร์เซ็นต์เทียบกับเป้าหมาย 10,000 ก้าว
  sleepDurationMinutes: number;   // เวลานอนรวม (นาที)
  sleepDurationFormatted: string; // เวลานอนรูปแบบ "X ชั่วโมง Y นาที"
  heartRateAvg: number;           // อัตราการเต้นหัวใจเฉลี่ย (bpm)
  heartRateMin: number;           // ต่ำสุด (bpm)
  heartRateMax: number;           // สูงสุด (bpm)
  rawData: {                      // JSON ดิบสำหรับส่งให้ Gemini
    steps: AggregateResponse;
    heartRate: AggregateResponse;
    sleep: SleepSessionsResponse;
  };
}

// ─── Gemini AI ───────────────────────────────────────────────────────────────

export interface GeminiContent {
  parts: Array<{ text: string }>;
  role: string;
}

export interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig: {
    temperature: number;
    topK: number;
    topP: number;
    maxOutputTokens: number;
  };
}

export interface GeminiResponse {
  candidates: Array<{
    content: GeminiContent;
    finishReason: string;
    safetyRatings: Array<{ category: string; probability: string }>;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// ─── Discord ─────────────────────────────────────────────────────────────────

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordPayload {
  username: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}
