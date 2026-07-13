// src/types.ts
// TypeScript interfaces และ types สำหรับทั้งโปรเจกต์

// ─── Google OAuth ────────────────────────────────────────────────────────────

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// ─── Google Health API v4 ────────────────────────────────────────────────────
// Schema อ้างอิงจาก: https://health.googleapis.com/$discovery/rest?version=v4

/** วันที่แบบ civil time ที่ Google Health API v4 ใช้ */
export interface CivilDateTime {
  date: {
    year: number;
    month: number;
    day: number;
  };
  time?: {
    hours?: number;
    minutes?: number;
    seconds?: number;
    nanos?: number;
  };
}

/** ช่วงเวลาสำหรับ dailyRollUp request */
export interface CivilTimeInterval {
  start: CivilDateTime;
  end: CivilDateTime;
}

/** Request body สำหรับ POST .../dataPoints:dailyRollUp */
export interface DailyRollUpRequest {
  range: CivilTimeInterval;
  windowSizeDays?: number;  // default 1
  pageSize?: number;
  pageToken?: string;
  dataSourceFamily?: string;
}

/** Response: ก้าวเดิน — steps.countSum */
export interface StepsRollupValue {
  countSum: string; // int64 เป็น string ใน JSON
}

/** Response: อัตราการเต้นหัวใจ */
export interface HeartRateRollupValue {
  beatsPerMinuteAvg: number;
  beatsPerMinuteMin: number;
  beatsPerMinuteMax: number;
}

/** Response: Sleep summary */
export interface SleepSummary {
  minutesAsleep: string;         // int64 string
  minutesInSleepPeriod: string;  // int64 string
  minutesToFallAsleep: string;   // int64 string
  minutesAwake: string;          // int64 string
}

/** Data point หนึ่งก้อน จาก dailyRollUp response */
export interface DailyRollupDataPoint {
  civilStartTime: CivilDateTime;
  civilEndTime: CivilDateTime;
  // field ที่ return ขึ้นอยู่กับ dataType ที่ query
  steps?: StepsRollupValue;
  heartRate?: HeartRateRollupValue;
  sleep?: { summary?: SleepSummary };
  [key: string]: unknown; // รองรับ field อื่นๆ
}

/** Response จาก dailyRollUp
 *  ⚠️  Field จริงจาก API ชื่อว่า rollupDataPoints ไม่ใช่ dataPoints
 *      (ยืนยันจาก debug log: "steps response keys: rollupDataPoints")
 */
export interface DailyRollUpResponse {
  rollupDataPoints: DailyRollupDataPoint[]; // ชื่อ field จริงจาก Google Health API v4
  nextPageToken?: string;
}

/**
 * Response จาก reconcile endpoint — ใช้กับ sleep
 * sleep ไม่รองรับ dailyRollUp — ต้องดึงผ่าน reconcile (GET)
 */
export interface SleepDataPoint {
  name?: string;
  startTime?: string;  // RFC 3339 datetime
  endTime?: string;    // RFC 3339 datetime
  sleep?: {
    summary?: {
      minutesAsleep?: string;        // int64 string
      minutesInSleepPeriod?: string; // int64 string
      minutesAwake?: string;         // int64 string
    };
  };
  [key: string]: unknown;
}

export interface SleepReconcileResponse {
  dataPoints: SleepDataPoint[];
  nextPageToken?: string;
}

// ─── Health Summary ──────────────────────────────────────────────────────────

/** ข้อมูลสุขภาพรวมที่ดึงมาจาก Google Health API v4 */
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
    steps: DailyRollUpResponse;
    heartRate: DailyRollUpResponse;
    sleep: SleepReconcileResponse; // ใช้ reconcile endpoint เพราะ sleep ไม่รองรับ dailyRollUp
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
    thinkingConfig?: {
      thinkingBudget: number; // 0 = disable thinking (ลด latency + ค่าใช้จ่าย)
    };
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

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordPayload {
  username: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}
