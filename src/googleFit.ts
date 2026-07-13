// src/googleFit.ts
// ดึงข้อมูลสุขภาพของ "เมื่อวาน" จาก Google Health API v4
// Base URL: https://health.googleapis.com/v4/
// Ref: https://health.googleapis.com/$discovery/rest?version=v4
//
// ⚠️  Sleep ใช้ endpoint ต่างจาก steps/heart-rate:
//    steps, heart-rate → POST .../dataPoints:dailyRollUp
//    sleep             → GET  .../dataPoints:reconcile  (dailyRollUp ไม่รองรับ)

import axios from "axios";
import {
  DailyRollUpRequest,
  DailyRollUpResponse,
  SleepReconcileResponse,
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

function buildDayRange(
  year: number,
  month: number,
  day: number,
): DailyRollUpRequest["range"] {
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
  day: number,
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
    console.error(
      `❌ [${label}] Google Health API Error ${error.response.status}:`,
    );
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
  range: DailyRollUpRequest["range"],
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

/**
 * ดึงข้อมูล Sleep ผ่าน reconcile endpoint (GET)
 *
 * Endpoint: GET /v4/users/me/dataTypes/sleep/dataPoints:reconcile
 *
 * ⚠️  ไม่ใช้ filter parameter เพราะ AIP-160 field name ของ sleep ไม่มีเอกสาร
 *     ดึง sessions ล่าสุดทั้งหมด (max 25) แล้ว filter วันที่ฝั่ง client แทน
 */
async function fetchSleepReconcile(
  accessToken: string,
  startDate: string, // "YYYY-MM-DD" (yesterday ใน Bangkok time)
  endDate: string, // "YYYY-MM-DD" (today ใน Bangkok time)
): Promise<SleepReconcileResponse> {
  const url = `${HEALTH_BASE}/users/me/dataTypes/sleep/dataPoints:reconcile`;

  // Sleep window สำหรับ "คืนของเมื่อวาน":
  //   เริ่ม: เมื่อวาน 18:00 Bangkok (เวลาเริ่มนอนเร็วที่สุดที่สมเหตุสมผล)
  //   สิ้น: วันนี้  13:00 Bangkok (เวลาตื่นสายที่สุดที่สมเหตุสมผล)
  //
  // ตัวอย่าง:
  //   นอน 23:00 Jul-12 Bangkok = 16:00 UTC Jul-12  (>= start ✓)
  //   ตื่น 06:00 Jul-13 Bangkok = 23:00 UTC Jul-12  (<= end ✓)
  const sleepStartMs = new Date(`${startDate}T18:00:00+07:00`).getTime(); // เมื่อวาน 18:00 BKK
  const sleepEndMs = new Date(`${endDate}T13:00:00+07:00`).getTime(); // วันนี้ 13:00 BKK

  console.log(
    `    ↳ Sleep window: ${new Date(sleepStartMs).toISOString()} → ${new Date(sleepEndMs).toISOString()}`,
  );

  try {
    const response = await axios.get<SleepReconcileResponse>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { pageSize: 25 },
    });

    const allPoints = response.data.dataPoints ?? [];

    // แสดง timestamp ของทุก session เพื่อ debug
    if (allPoints.length > 0) {
      console.log(`    ↳ Sessions ทั้งหมด:`);
      allPoints.forEach((p, i) => {
        console.log(
          `       [${i}] start=${p.startTime ?? "?"}  end=${p.endTime ?? "?"}`,
        );
      });
    }

    // กรองเฉพาะ session ที่:
    //   startTime >= เมื่อวาน 18:00 Bangkok
    //   endTime   <= วันนี้ 13:00 Bangkok
    const yesterdayPoints = allPoints.filter((point) => {
      const startT = point.startTime
        ? new Date(point.startTime).getTime()
        : null;
      const endT = point.endTime ? new Date(point.endTime).getTime() : null;
      if (startT === null || endT === null) return false;
      return startT >= sleepStartMs && endT <= sleepEndMs;
    });

    console.log(`    ↳ กรองเหลือ ${yesterdayPoints.length} sleep session`);

    return { dataPoints: yesterdayPoints, nextPageToken: undefined };
  } catch (error) {
    handleApiError("reconcile/sleep", error);
  }
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseSteps(data: DailyRollUpResponse): number {
  let total = 0;

  // Field จริงจาก Google Health API v4 ชื่อว่า rollupDataPoints
  const points = data.rollupDataPoints ?? [];
  console.log(`    ↳ steps: พบ ${points.length} dataPoints`);

  for (const point of points) {
    const countSum = point.steps?.countSum;
    if (countSum) total += parseInt(String(countSum), 10);
  }
  return total;
}

interface HeartRateStats {
  avg: number;
  min: number;
  max: number;
}

function parseHeartRate(data: DailyRollUpResponse): HeartRateStats {
  let sumAvg = 0;
  let globalMin = Infinity;
  let globalMax = -Infinity;
  let count = 0;

  // Field จริงจาก Google Health API v4 ชื่อว่า rollupDataPoints
  const points = data.rollupDataPoints ?? [];
  console.log(`    ↳ heartRate: พบ ${points.length} dataPoints`);

  for (const point of points) {
    const hr = point.heartRate;
    if (!hr) continue;

    const avg = hr.beatsPerMinuteAvg ?? 0;
    const min = hr.beatsPerMinuteMin ?? 0;
    const max = hr.beatsPerMinuteMax ?? 0;

    if (avg > 0) {
      sumAvg += avg;
      count++;
    }
    if (min > 0 && min < globalMin) globalMin = min;
    if (max > 0 && max > globalMax) globalMax = max;
  }

  return {
    avg: count > 0 ? Math.round(sumAvg / count) : 0,
    min: globalMin === Infinity ? 0 : Math.round(globalMin),
    max: globalMax === -Infinity ? 0 : Math.round(globalMax),
  };
}

function parseSleepMinutes(data: SleepReconcileResponse): number {
  let totalMs = 0;

  for (const point of data.dataPoints ?? []) {
    // Priority 1: ใช้ summary.minutesInSleepPeriod ถ้ามี
    const minutesStr =
      point.sleep?.summary?.minutesInSleepPeriod ??
      point.sleep?.summary?.minutesAsleep;
    if (minutesStr) {
      totalMs += parseInt(minutesStr, 10) * 60_000;
      continue;
    }

    // Priority 2: คำนวณจาก startTime/endTime ของ session
    if (point.startTime && point.endTime) {
      const start = new Date(point.startTime).getTime();
      const end = new Date(point.endTime).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        totalMs += end - start;
      }
    }
  }

  return Math.round(totalMs / 60_000); // ms → นาที
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
  accessToken: string,
): Promise<HealthData> {
  const timezone = process.env.TIMEZONE ?? "Asia/Bangkok";
  const { year, month, day, dateLabel } = getYesterdayDate(timezone);
  const range = buildDayRange(year, month, day);

  // สร้าง date string สำหรับ sleep reconcile filter
  const startDateStr = dateLabel; // "YYYY-MM-DD"
  const nextDay = buildNextDay(year, month, day);
  const endDateStr = `${nextDay.date.year}-${String(nextDay.date.month).padStart(2, "0")}-${String(nextDay.date.day).padStart(2, "0")}`;

  console.log(
    `📅 ดึงข้อมูลวันที่: ${dateLabel} (${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} civil time)`,
  );
  console.log("📊 กำลังดึงข้อมูล Google Health API v4...");

  // ─── ดึงทีละ call เพื่อให้ log บอกได้ว่า call ไหนพัง ─────────────────────

  console.log("  ├─ 1/3 ก้าวเดิน (steps → dailyRollUp)...");
  const stepsData = await fetchDailyRollUp(accessToken, "steps", range);

  console.log("  ├─ 2/3 อัตราการเต้นหัวใจ (heart-rate → dailyRollUp)...");
  const heartRateData = await fetchDailyRollUp(
    accessToken,
    "heart-rate",
    range,
  );

  console.log("  └─ 3/3 การนอนหลับ (sleep → reconcile)...");
  const sleepData = await fetchSleepReconcile(
    accessToken,
    startDateStr,
    endDateStr,
  );

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
