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
  // ใช้ Intl.DateTimeFormat เพื่อให้ถูก timezone ของผู้ใช้
  const now = new Date();

  // หา "เมื่อวาน" ใน local timezone
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  // ดึง year/month/day ตาม timezone
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [{ value: year }, , { value: month }, , { value: day }] =
    fmt.formatToParts(yesterday);

  const dateLabel = `${year}-${month}-${day}`;

  // ต้นวัน 00:00:00 local time → UTC ms
  const startLocal = new Date(`${dateLabel}T00:00:00`);
  const endLocal = new Date(`${dateLabel}T23:59:59.999`);

  // แปลงเป็น UTC โดยคำนึง offset ของ timezone ที่ระบุ
  const offsetMs = getTimezoneOffsetMs(timezone, startLocal);

  const startMs = startLocal.getTime() - offsetMs;
  const endMs = endLocal.getTime() - offsetMs;

  return { startMs, endMs, dateLabel };
}

/** คำนวณ offset (ms) ของ timezone ที่ระบุ */
function getTimezoneOffsetMs(timezone: string, date: Date): number {
  // ดู UTC offset จริงๆ ของ timezone ณ วันนั้น
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const localStr = date.toLocaleString("en-US", { timeZone: timezone });
  const diff = new Date(utcStr).getTime() - new Date(localStr).getTime();
  return diff;
}

// ─── API Calls ───────────────────────────────────────────────────────────────

/** ดึงข้อมูล Aggregate (ก้าวเดิน, หัวใจ) ผ่าน /dataset:aggregate */
async function fetchAggregate(
  accessToken: string,
  dataSourceIds: string[],
  aggregateBy: Array<{ dataTypeName: string }>,
  startMs: number,
  endMs: number,
): Promise<AggregateResponse> {
  const url = `${FIT_BASE}/dataset:aggregate`;

  const body = {
    aggregateBy,
    bucketByTime: { durationMillis: endMs - startMs },
    startTimeMillis: startMs.toString(),
    endTimeMillis: endMs.toString(),
  };

  const response = await axios.post<AggregateResponse>(url, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

/** ดึง Sleep sessions ผ่าน /sessions */
async function fetchSleepSessions(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<SleepSessionsResponse> {
  // Google Fit Sleep: activityType=72 (sleep)
  const url = `${FIT_BASE}/sessions`;

  const response = await axios.get<SleepSessionsResponse>(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      activityType: 72,
    },
  });

  return response.data;
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

  const [stepsData, heartRateData, sleepData] = await Promise.all([
    // 1. ก้าวเดิน
    fetchAggregate(
      accessToken,
      [],
      [{ dataTypeName: "com.google.step_count.delta" }],
      startMs,
      endMs,
    ),

    // 2. อัตราการเต้นหัวใจ (avg, min, max ต่อ bucket)
    fetchAggregate(
      accessToken,
      [],
      [{ dataTypeName: "com.google.heart_rate.bpm" }],
      startMs,
      endMs,
    ),

    // 3. การนอนหลับ (sessions)
    fetchSleepSessions(accessToken, startMs, endMs),
  ]);

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
