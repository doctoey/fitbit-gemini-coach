// src/googleFit.ts
// ดึงข้อมูลสุขภาพของ "เมื่อวาน" จาก Google Health API v4
// Base URL: https://health.googleapis.com/v4/
// Ref: https://health.googleapis.com/$discovery/rest?version=v4

import axios from "axios";
import {
  DailyRollUpRequest,
  DailyRollUpResponse,
  DailyRollupDataPoint,
  HealthData,
} from "./types";

const HEALTH_BASE = "https://health.googleapis.com/v4";

// ─── Helper: หาวันเมื่อวานใน civil time (year/month/day) ───────────────────

interface YesterdayDate {
  year: number;
  month: number;
  day: number;
  dateLabel: string; // เช่น "2024-07-11"
}

function getYesterdayDate(timezone: string = "Asia/Bangkok"): YesterdayDate {
  const now = new Date();

  // ใช้ en-CA locale เพราะ format ออกมาเป็น "YYYY-MM-DD" ตรงๆ
  const todayLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(now);
  const [ty, tm, td] = todayLabel.split("-").map(Number);

  // ลบ 1 วัน (ใช้ UTC noon เพื่อป้องกัน DST edge case)
  const yesterdayNoon = Date.UTC(ty, tm - 1, td - 1, 12, 0, 0);
  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(new Date(yesterdayNoon));

  const [year, month, day] = dateLabel.split("-").map(Number);
  return { year, month, day, dateLabel };
}

// ─── Helper: สร้าง CivilTimeInterval สำหรับ 1 วัน ──────────────────────────

function buildDayRange(year: number, month: number, day: number): DailyRollUpRequest["range"] {
  return {
    // inclusive start = ต้นวัน 00:00
    start: { date: { year, month, day } },
    // exclusive end = ต้นวันถัดไป 00:00
    // (Google Health API v4 ใช้ half-open interval [start, end))
    end: buildNextDay(year, month, day),
  };
}

function buildNextDay(
  year: number,
  month: number,
  day: number
): { date: { year: number; month: number; day: number } } {
  // ใช้ Date object เพื่อ handle month rollover อัตโนมัติ
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    date: {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    },
  };
}

// ─── Error Handler ───────────────────────────────────────────────────────────

function handleApiError(label: string, error: unknown): never {
  if (axios.isAxiosError(error) && error.response) {
    console.error(`❌ [${label}] Google Health API Error ${error.response.status}:`);
    console.error("   Detail:", JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(`❌ [${label}] Unknown error:`, error);
  }
  throw error;
}

// ─── API Call: dailyRollUp ───────────────────────────────────────────────────

/**
 * เรียก Google Health API v4 ด้วย dailyRollUp
 *
 * Endpoint: POST /v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp
 *
 * @param accessToken - Bearer token จาก OAuth
 * @param dataType    - kebab-case data type เช่น "steps", "heart-rate", "sleep"
 * @param range       - ช่วงเวลา civil time
 */
async function fetchDailyRollUp(
  accessToken: string,
  dataType: string,
  range: DailyRollUpRequest["range"]
): Promise<DailyRollUpResponse> {
  const url = `${HEALTH_BASE}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`;

  const body: DailyRollUpRequest = {
    range,
    windowSizeDays: 1, // รวมข้อมูลเป็น bucket ละ 1 วัน
  };

  try {
    const response = await axios.post<DailyRollUpResponse>(url, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    handleApiError(`dailyRollUp/${dataType}`, error);
  }
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseSteps(data: DailyRollUpResponse): number {
  let total = 0;
  for (const point of data.dataPoints ?? []) {
    // steps.countSum เป็น int64 ที่ API ส่งมาเป็น string
    const countSum = point.steps?.countSum;
    if (countSum) total += parseInt(countSum, 10);
  }
  return total;
}

interface HeartRateStats {
  avg: number;
  min: number;
  max: number;
}

function parseHeartRate(data: DailyRollUpResponse): HeartRateStats {
  // dailyRollUp ส่ง heartRate ต่อ bucket
  // ถ้ามีหลาย bucket ให้เฉลี่ย avg และหา min/max รวม
  let sumAvg = 0;
  let globalMin = Infinity;
  let globalMax = -Infinity;
  let count = 0;

  for (const point of data.dataPoints ?? []) {
    const hr = point.heartRate;
    if (!hr) continue;

    if (hr.beatsPerMinuteAvg > 0) {
      sumAvg += hr.beatsPerMinuteAvg;
      count++;
    }
    if (hr.beatsPerMinuteMin > 0 && hr.beatsPerMinuteMin < globalMin)
      globalMin = hr.beatsPerMinuteMin;
    if (hr.beatsPerMinuteMax > 0 && hr.beatsPerMinuteMax > globalMax)
      globalMax = hr.beatsPerMinuteMax;
  }

  return {
    avg: count > 0 ? Math.round(sumAvg / count) : 0,
    min: globalMin === Infinity ? 0 : Math.round(globalMin),
    max: globalMax === -Infinity ? 0 : Math.round(globalMax),
  };
}

function parseSleepMinutes(data: DailyRollUpResponse): number {
  let total = 0;
  for (const point of data.dataPoints ?? []) {
    // minutesInSleepPeriod = เวลาอยู่บนเตียงรวม (รวม awake)
    // minutesAsleep        = เวลาที่หลับจริง (ไม่รวม awake)
    // เราใช้ minutesInSleepPeriod เพื่อให้ตรงกับ "ระยะเวลาการนอนหลับ"
    const minutes = point.sleep?.summary?.minutesInSleepPeriod;
    if (minutes) total += parseInt(minutes, 10);
  }
  return total;
}

function formatSleepDuration(minutes: number): string {
  if (minutes === 0) return "ไม่มีข้อมูล";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} ชั่วโมง ${m} นาที`;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * ดึงข้อมูลสุขภาพทั้งหมดของเมื่อวานจาก Google Health API v4
 * และคืน HealthData object ที่พร้อมส่งให้ Gemini วิเคราะห์
 */
export async function fetchYesterdayHealthData(
  accessToken: string
): Promise<HealthData> {
  const timezone = process.env.TIMEZONE ?? "Asia/Bangkok";
  const { year, month, day, dateLabel } = getYesterdayDate(timezone);
  const range = buildDayRange(year, month, day);

  console.log(
    `📅 ดึงข้อมูลวันที่: ${dateLabel} (${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} civil time)`
  );
  console.log("📊 กำลังดึงข้อมูล Google Health API v4...");

  // ─── ดึงทีละ call เพื่อให้ log บอกได้ว่า call ไหนพัง ─────────────────────

  console.log("  ├─ 1/3 ก้าวเดิน (steps)...");
  const stepsData = await fetchDailyRollUp(accessToken, "steps", range);

  console.log("  ├─ 2/3 อัตราการเต้นหัวใจ (heart-rate)...");
  const heartRateData = await fetchDailyRollUp(accessToken, "heart-rate", range);

  console.log("  └─ 3/3 การนอนหลับ (sleep)...");
  const sleepData = await fetchDailyRollUp(accessToken, "sleep", range);

  // ─── แปลงข้อมูล ────────────────────────────────────────────────────────

  const steps = parseSteps(stepsData);
  const heartRate = parseHeartRate(heartRateData);
  const sleepMinutes = parseSleepMinutes(sleepData);

  const STEP_GOAL = 10_000;
  const stepGoalPercent = Math.round((steps / STEP_GOAL) * 100);

  console.log(
    `✅ ก้าว: ${steps.toLocaleString()} | นอน: ${sleepMinutes} นาที | หัวใจ avg: ${heartRate.avg} bpm`
  );

  return {
    date: dateLabel,
    steps,
    stepGoalPercent,
    sleepDurationMinutes: sleepMinutes,
    sleepDurationFormatted: formatSleepDuration(sleepMinutes),
    heartRateAvg: heartRate.avg,
    heartRateMin: heartRate.min,
    heartRateMax: heartRate.max,
    rawData: {
      steps: stepsData,
      heartRate: heartRateData,
      sleep: sleepData,
    },
  };
}
