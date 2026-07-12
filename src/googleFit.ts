// src/googleFit.ts
// ดึงข้อมูลสุขภาพของ "เมื่อวาน" จาก Google Fit REST API

import axios from "axios";
import { AggregateResponse, HealthData, SleepSessionsResponse } from "./types";

const FIT_BASE = "https://www.googleapis.com/fitness/v1/users/me";

// ─── Helper: สร้างช่วงเวลาเมื่อวาน ─────────────────────────────────────────

interface YesterdayRange {
  startMs: number; // timestamp milliseconds ต้นวัน 00:00
  endMs: number; // timestamp milliseconds ปลายวัน 23:59:59.999
  dateLabel: string; // เช่น "2024-07-11"
}

function getYesterdayRange(timezone: string = "Asia/Bangkok"): YesterdayRange {
  const now = new Date();

  // ─── Step 1: หาวันเมื่อวานใน timezone ที่ระบุ ────────────────────────────
  // ใช้ en-CA locale เพราะ format ออกมาเป็น "YYYY-MM-DD" ตรงๆ
  const todayLabel = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const [ty, tm, td] = todayLabel.split("-").map(Number);

  // ลบ 1 วัน (ใช้ UTC noon เพื่อป้องกัน DST edge case)
  const yesterdayNoon = Date.UTC(ty, tm - 1, td - 1, 12, 0, 0);
  const dateLabel = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(yesterdayNoon)
  );
  const [dy, dm, dd] = dateLabel.split("-").map(Number);

  // ─── Step 2: หา UTC offset ที่แท้จริงของ timezone ─────────────────────────
  // สร้าง probe = UTC midnight ของวันเมื่อวาน แล้วดูว่า local time เป็นเท่าไหร่
  const utcMidnight = Date.UTC(dy, dm - 1, dd, 0, 0, 0);
  const probe = new Date(utcMidnight);

  // ดึง local hour และ minute ณ probe time
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(probe);

  const localHour = Number(timeParts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const localMin = Number(timeParts.find((p) => p.type === "minute")?.value ?? "0");

  // offsetMs = เวลาที่ timezone เร็วกว่า UTC (บวก = ahead, ลบ = behind)
  // ตัวอย่าง Bangkok UTC+7: probe ที่ 00:00 UTC → local = 07:00 → offsetMs = +7h
  // สูตร: UTC midnight ของ local = utcMidnight - offsetMs
  const offsetMs = (localHour * 3600 + localMin * 60) * 1000;

  const startMs = utcMidnight - offsetMs;          // เที่ยงคืน local → UTC
  const endMs = startMs + 86_400_000 - 1;          // +24h - 1ms

  return { startMs, endMs, dateLabel };
}

// ─── API Calls ───────────────────────────────────────────────────────────────

/** พ่น error detail ของ Google API ออกมาให้อ่านได้ใน log */
function handleGoogleApiError(label: string, error: unknown): never {
  if (axios.isAxiosError(error) && error.response) {
    console.error(`❌ [${label}] Google API Error ${error.response.status}:`);
    console.error("   Detail:", JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(`❌ [${label}] Unknown error:`, error);
  }
  throw error;
}

/** ดึงข้อมูล Aggregate (ก้าวเดิน, หัวใจ) ผ่าน /dataset:aggregate */
async function fetchAggregate(
  accessToken: string,
  aggregateBy: Array<{ dataTypeName: string }>,
  startMs: number,
  endMs: number,
): Promise<AggregateResponse> {
  const url = `${FIT_BASE}/dataset:aggregate`;
  const label = aggregateBy.map((a) => a.dataTypeName).join(", ");

  const body = {
    aggregateBy,
    bucketByTime: { durationMillis: 86_400_000 }, // 1 วันพอดี
    startTimeMillis: startMs.toString(),
    endTimeMillis: endMs.toString(),
  };

  try {
    const response = await axios.post<AggregateResponse>(url, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    handleGoogleApiError(`Aggregate: ${label}`, error);
  }
}

/** ดึง Sleep sessions ผ่าน /sessions */
async function fetchSleepSessions(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<SleepSessionsResponse> {
  // Google Fit Sleep: activityType=72
  const url = `${FIT_BASE}/sessions`;

  try {
    const response = await axios.get<SleepSessionsResponse>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        activityType: 72,
      },
    });
    return response.data;
  } catch (error) {
    handleGoogleApiError("Sleep Sessions", error);
  }
}

// ─── Parser: แปลง raw data เป็น HealthData ──────────────────────────────────

function parseSteps(data: AggregateResponse): number {
  let total = 0;
  for (const bucket of data.bucket ?? []) {
    for (const ds of bucket.dataset ?? []) {
      for (const point of ds.point ?? []) {
        total += point.value[0]?.intVal ?? 0;
      }
    }
  }
  return total;
}

interface HeartRateStats {
  avg: number;
  min: number;
  max: number;
}

function parseHeartRate(data: AggregateResponse): HeartRateStats {
  let sumAvg = 0,
    globalMin = Infinity,
    globalMax = -Infinity,
    count = 0;

  for (const bucket of data.bucket ?? []) {
    for (const ds of bucket.dataset ?? []) {
      for (const point of ds.point ?? []) {
        const avg = point.value[0]?.fpVal;
        const min = point.value[1]?.fpVal;
        const max = point.value[2]?.fpVal;

        if (avg !== undefined) {
          sumAvg += avg;
          count++;
        }
        if (min !== undefined && min < globalMin) globalMin = min;
        if (max !== undefined && max > globalMax) globalMax = max;
      }
    }
  }

  return {
    avg: count > 0 ? Math.round(sumAvg / count) : 0,
    min: globalMin === Infinity ? 0 : Math.round(globalMin),
    max: globalMax === -Infinity ? 0 : Math.round(globalMax),
  };
}

function parseSleepMinutes(data: SleepSessionsResponse): number {
  let totalMs = 0;
  for (const session of data.session ?? []) {
    const start = parseInt(session.startTimeMillis, 10);
    const end = parseInt(session.endTimeMillis, 10);
    if (!isNaN(start) && !isNaN(end)) {
      totalMs += end - start;
    }
  }
  return Math.round(totalMs / 60000); // ms → นาที
}

function formatSleepDuration(minutes: number): string {
  if (minutes === 0) return "ไม่มีข้อมูล";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} ชั่วโมง ${m} นาที`;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * ดึงข้อมูลสุขภาพทั้งหมดของเมื่อวาน และคืน HealthData object
 */
export async function fetchYesterdayHealthData(
  accessToken: string,
): Promise<HealthData> {
  const timezone = process.env.TIMEZONE ?? "Asia/Bangkok";
  const { startMs, endMs, dateLabel } = getYesterdayRange(timezone);

  console.log(
    `📅 ดึงข้อมูลวันที่: ${dateLabel} (${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()})`,
  );

  // ─── ดึงพร้อมกัน 3 ชุด ──────────────────────────────────────────────────

  console.log("📊 กำลังดึงข้อมูล Google Fit...");

  // ─── ดึงทีละ call เพื่อให้ log บอกได้ว่า call ไหนพัง ─────────────────────

  console.log("  ├─ 1/3 ก้าวเดิน...");
  const stepsData = await fetchAggregate(
    accessToken,
    [{ dataTypeName: "com.google.step_count.delta" }],
    startMs,
    endMs,
  );

  console.log("  ├─ 2/3 อัตราการเต้นหัวใจ...");
  const heartRateData = await fetchAggregate(
    accessToken,
    [{ dataTypeName: "com.google.heart_rate.bpm" }],
    startMs,
    endMs,
  );

  console.log("  └─ 3/3 การนอนหลับ...");
  const sleepData = await fetchSleepSessions(accessToken, startMs, endMs);

  // ─── แปลงข้อมูล ────────────────────────────────────────────────────────

  const steps = parseSteps(stepsData);
  const heartRate = parseHeartRate(heartRateData);
  const sleepMinutes = parseSleepMinutes(sleepData);

  const STEP_GOAL = 10_000;
  const stepGoalPercent = Math.round((steps / STEP_GOAL) * 100);

  console.log(
    `✅ ก้าว: ${steps.toLocaleString()} | นอน: ${sleepMinutes} นาที | หัวใจ avg: ${heartRate.avg} bpm`,
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
