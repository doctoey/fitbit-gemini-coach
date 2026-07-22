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
  SleepDataPoint,
  HealthData,
  DailyRollupDataPoint,
  RestingHeartRateReconcileResponse,
  RestingHeartRateDataPoint,
  SleepStages,
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
 */
async function fetchSleepReconcile(
  accessToken: string,
  sleepStartMs: number,
  sleepEndMs: number,
  pageSize = 50,
): Promise<SleepReconcileResponse> {
  const url = `${HEALTH_BASE}/users/me/dataTypes/sleep/dataPoints:reconcile`;

  console.log(
    `    ↳ Sleep window: ${new Date(sleepStartMs).toISOString()} → ${new Date(sleepEndMs).toISOString()}`,
  );

  try {
    const response = await axios.get<SleepReconcileResponse>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { pageSize },
    });

    const raw = response.data as unknown as Record<string, unknown>;
    const allPoints: unknown[] =
      response.data.dataPoints ?? (raw["data_points"] as unknown[]) ?? [];

    console.log(`    ↳ Sleep: พบ ${allPoints.length} sessions`);

    const rangePoints = allPoints.filter((item) => {
      const p = item as Record<string, unknown>;
      const sleepObj = p["sleep"] as Record<string, unknown> | undefined;
      const interval = sleepObj?.["interval"] as
        | Record<string, unknown>
        | undefined;

      const startStr = interval?.["startTime"] as string | undefined;
      const endStr = interval?.["endTime"] as string | undefined;
      if (!startStr || !endStr) return false;

      const startT = new Date(startStr).getTime();
      const endT = new Date(endStr).getTime();
      return startT >= sleepStartMs && endT <= sleepEndMs;
    });

    console.log(`    ↳ กรองเหลือ ${rangePoints.length} sleep session`);

    return {
      dataPoints: rangePoints as SleepDataPoint[],
      nextPageToken: undefined,
    };
  } catch (error) {
    handleApiError("reconcile/sleep", error);
  }
}

async function fetchRestingHeartRateReconcile(
  accessToken: string,
  pageSize = 50,
): Promise<RestingHeartRateReconcileResponse> {
  const url = `${HEALTH_BASE}/users/me/dataTypes/daily-resting-heart-rate/dataPoints:reconcile`;

  try {
    const response = await axios.get<RestingHeartRateReconcileResponse>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { pageSize },
    });
    return response.data;
  } catch (error) {
    handleApiError("reconcile/daily-resting-heart-rate", error);
  }
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

export function findRollupPointForDate(
  data: DailyRollUpResponse,
  dateStr: string,
): DailyRollupDataPoint | undefined {
  return (data.rollupDataPoints ?? []).find((point) => {
    const start = point.civilStartTime;
    if (!start || !start.date) return false;
    const formatted = `${start.date.year}-${String(start.date.month).padStart(2, "0")}-${String(start.date.day).padStart(2, "0")}`;
    return formatted === dateStr;
  });
}

export function parseStepsForDate(
  data: DailyRollUpResponse,
  dateStr: string,
): number {
  const point = findRollupPointForDate(data, dateStr);
  const countSum = point?.steps?.countSum;
  return countSum ? parseInt(String(countSum), 10) : 0;
}

export function parseSteps(data: DailyRollUpResponse): number {
  let total = 0;
  const points = data.rollupDataPoints ?? [];
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

export function parseHeartRateForDate(
  data: DailyRollUpResponse,
  dateStr: string,
): HeartRateStats {
  const point = findRollupPointForDate(data, dateStr);
  const hr = point?.heartRate;
  if (!hr) return { avg: 0, min: 0, max: 0 };
  return {
    avg: Math.round(hr.beatsPerMinuteAvg ?? 0),
    min: Math.round(hr.beatsPerMinuteMin ?? 0),
    max: Math.round(hr.beatsPerMinuteMax ?? 0),
  };
}

export function parseHeartRate(data: DailyRollUpResponse): HeartRateStats {
  let sumAvg = 0;
  let globalMin = Infinity;
  let globalMax = -Infinity;
  let count = 0;

  const points = data.rollupDataPoints ?? [];
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

export function parseSleepMinutesForDate(
  allPoints: SleepDataPoint[],
  dateStr: string,
): number {
  const d = new Date(dateStr);
  const nextDay = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;

  const sleepStartMs = new Date(`${dateStr}T18:00:00+07:00`).getTime();
  const sleepEndMs = new Date(`${nextDayStr}T13:00:00+07:00`).getTime();

  let totalMinutes = 0;
  for (const point of allPoints) {
    const p = point as Record<string, unknown>;
    const sleepObj = p["sleep"] as Record<string, unknown> | undefined;
    if (!sleepObj) continue;

    const interval = sleepObj["interval"] as
      | Record<string, unknown>
      | undefined;
    const startStr = interval?.["startTime"] as string | undefined;
    const endStr = interval?.["endTime"] as string | undefined;
    if (!startStr || !endStr) continue;

    const startT = new Date(startStr).getTime();
    const endT = new Date(endStr).getTime();

    if (startT >= sleepStartMs && endT <= sleepEndMs) {
      const summary = sleepObj["summary"] as
        | Record<string, unknown>
        | undefined;
      const minutesAsleep = summary?.["minutesAsleep"];
      if (minutesAsleep) {
        totalMinutes += parseInt(String(minutesAsleep), 10);
      } else {
        totalMinutes += Math.round((endT - startT) / 60_000);
      }
    }
  }
  return totalMinutes;
}

export function parseSleepStagesForDate(
  allPoints: SleepDataPoint[],
  dateStr: string,
): SleepStages {
  const d = new Date(dateStr);
  const nextDay = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;

  // หน้าต่างเวลาเดียวกับที่ใช้ใน parseSleepMinutesForDate (googleFit.ts)
  const sleepStartMs = new Date(`${dateStr}T18:00:00+07:00`).getTime();
  const sleepEndMs = new Date(`${nextDayStr}T13:00:00+07:00`).getTime();

  const stages: SleepStages = {
    deep: 0,
    rem: 0,
    light: 0,
    awake: 0,
    restless: 0,
  };

  for (const point of allPoints) {
    const p = point as any;
    const sleepObj = p.sleep;
    if (!sleepObj) continue;

    const interval = sleepObj.interval;
    const startStr = interval?.startTime;
    const endStr = interval?.endTime;
    if (!startStr || !endStr) continue;

    const startT = new Date(startStr).getTime();
    const endT = new Date(endStr).getTime();

    // กรองเอาเฉพาะ session การนอนของวันดังกล่าว
    if (startT >= sleepStartMs && endT <= sleepEndMs) {
      const rawStages = sleepObj.stages;
      if (Array.isArray(rawStages)) {
        for (const s of rawStages) {
          const sStart = new Date(s.startTime).getTime();
          const sEnd = new Date(s.endTime).getTime();
          if (isNaN(sStart) || !sEnd || isNaN(sEnd)) continue;

          const minutes = Math.round((sEnd - sStart) / 60_000);
          const type = String(s.type).toUpperCase();

          if (type === "DEEP" || type === "DEEP_SLEEP") {
            stages.deep += minutes;
          } else if (type === "REM" || type === "REM_SLEEP") {
            stages.rem += minutes;
          } else if (type === "LIGHT" || type === "LIGHT_SLEEP") {
            stages.light += minutes;
          } else if (type === "AWAKE" || type === "AWAKE_IN_BED") {
            stages.awake += minutes;
          } else if (type === "RESTLESS" || type === "RESTLESSNESS") {
            stages.restless += minutes;
          } else {
            console.warn(`    ⚠️ พบ Sleep Stage Type ที่ไม่ได้แม็ป: "${s.type}" (${minutes} นาที)`);
          }
        }
      }
    }
  }

  console.log(`    ↳ Sleep Stages Parsed: Deep ${stages.deep}m | REM ${stages.rem}m | Light ${stages.light}m | Restless ${stages.restless}m | Awake ${stages.awake}m`);

  return stages;
}

export function parseSleepMinutes(data: SleepReconcileResponse): number {
  let totalMinutes = 0;
  for (const point of data.dataPoints ?? []) {
    const p = point as unknown as Record<string, unknown>;
    const sleepObj = p["sleep"] as Record<string, unknown> | undefined;
    if (!sleepObj) continue;

    const summary = sleepObj["summary"] as Record<string, unknown> | undefined;
    const minutesAsleep = summary?.["minutesAsleep"];
    if (minutesAsleep) {
      totalMinutes += parseInt(String(minutesAsleep), 10);
      continue;
    }

    const interval = sleepObj["interval"] as
      | Record<string, unknown>
      | undefined;
    const startStr = interval?.["startTime"] as string | undefined;
    const endStr = interval?.["endTime"] as string | undefined;
    if (startStr && endStr) {
      const start = new Date(startStr).getTime();
      const end = new Date(endStr).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        totalMinutes += Math.round((end - start) / 60_000);
      }
    }
  }
  return totalMinutes;
}

export function parseTotalCaloriesForDate(
  data: DailyRollUpResponse,
  dateStr: string,
): number {
  const point = findRollupPointForDate(data, dateStr);
  const kcalSum = point?.totalCalories?.kcalSum;
  return kcalSum ? Math.round(kcalSum) : 0;
}

export function parseTotalCalories(data: DailyRollUpResponse): number {
  let total = 0;
  const points = data.rollupDataPoints ?? [];
  for (const point of points) {
    const kcalSum = point.totalCalories?.kcalSum;
    if (kcalSum) total += kcalSum;
  }
  return Math.round(total);
}

interface ActiveZoneMinutesDetails {
  total: number;
  fatBurn: number;
  cardio: number;
  peak: number;
}

export function parseActiveZoneMinutesForDate(
  data: DailyRollUpResponse,
  dateStr: string,
): ActiveZoneMinutesDetails {
  const point = findRollupPointForDate(data, dateStr);
  const azm = point?.activeZoneMinutes;
  if (!azm) return { total: 0, fatBurn: 0, cardio: 0, peak: 0 };
  const fatBurn = parseInt(azm.sumInFatBurnHeartZone ?? "0", 10);
  const cardio = parseInt(azm.sumInCardioHeartZone ?? "0", 10);
  const peak = parseInt(azm.sumInPeakHeartZone ?? "0", 10);
  return {
    total: fatBurn + cardio + peak,
    fatBurn,
    cardio,
    peak,
  };
}

export function parseActiveZoneMinutes(
  data: DailyRollUpResponse,
): ActiveZoneMinutesDetails {
  let fatBurn = 0;
  let cardio = 0;
  let peak = 0;
  const points = data.rollupDataPoints ?? [];
  for (const point of points) {
    const azm = point.activeZoneMinutes;
    if (azm) {
      fatBurn += parseInt(azm.sumInFatBurnHeartZone ?? "0", 10);
      cardio += parseInt(azm.sumInCardioHeartZone ?? "0", 10);
      peak += parseInt(azm.sumInPeakHeartZone ?? "0", 10);
    }
  }
  return {
    total: fatBurn + cardio + peak,
    fatBurn,
    cardio,
    peak,
  };
}

export function parseRestingHeartRateForDate(
  allPoints: RestingHeartRateDataPoint[],
  dateStr: string,
): number {
  const point = allPoints.find((item) => {
    const rhr = item.dailyRestingHeartRate;
    if (!rhr || !rhr.date) return false;
    const formatted = `${rhr.date.year}-${String(rhr.date.month).padStart(2, "0")}-${String(rhr.date.day).padStart(2, "0")}`;
    return formatted === dateStr;
  });
  const bpm = point?.dailyRestingHeartRate?.beatsPerMinute;
  return bpm ? parseInt(String(bpm), 10) : 0;
}

export function parseRestingHeartRate(
  data: RestingHeartRateReconcileResponse,
): number {
  for (const point of data.dataPoints ?? []) {
    const bpm = point.dailyRestingHeartRate?.beatsPerMinute;
    if (bpm) return parseInt(String(bpm), 10);
  }
  return 0;
}

export function formatSleepDuration(minutes: number): string {
  if (minutes === 0) return "ไม่มีข้อมูล";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} ชั่วโมง ${m} นาที`;
}

// ─── Main Exports ────────────────────────────────────────────────────────────

/**
 * ดึงข้อมูลสุขภาพทั้งหมดของวันที่ระบุ
 */
export async function fetchHealthDataForDate(
  accessToken: string,
  dateLabel: string,
  year: number,
  month: number,
  day: number,
): Promise<HealthData> {
  const range = buildDayRange(year, month, day);

  const startDateStr = dateLabel; // "YYYY-MM-DD"
  const nextDay = buildNextDay(year, month, day);
  const endDateStr = `${nextDay.date.year}-${String(nextDay.date.month).padStart(2, "0")}-${String(nextDay.date.day).padStart(2, "0")}`;

  const sleepStartMs = new Date(`${startDateStr}T18:00:00+07:00`).getTime();
  const sleepEndMs = new Date(`${endDateStr}T13:00:00+07:00`).getTime();

  console.log(
    `📅 ดึงข้อมูลวันที่: ${dateLabel} (${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} civil time)`,
  );

  const stepsData = await fetchDailyRollUp(accessToken, "steps", range);
  const heartRateData = await fetchDailyRollUp(
    accessToken,
    "heart-rate",
    range,
  );
  const sleepData = await fetchSleepReconcile(
    accessToken,
    sleepStartMs,
    sleepEndMs,
    25,
  );
  const totalCaloriesData = await fetchDailyRollUp(
    accessToken,
    "total-calories",
    range,
  );
  const activeZoneMinutesData = await fetchDailyRollUp(
    accessToken,
    "active-zone-minutes",
    range,
  );
  const restingHeartRateData = await fetchRestingHeartRateReconcile(
    accessToken,
    25,
  );

  const steps = parseStepsForDate(stepsData, dateLabel);
  const heartRate = parseHeartRateForDate(heartRateData, dateLabel);
  const sleepMinutes = parseSleepMinutesForDate(
    sleepData.dataPoints,
    dateLabel,
  );
  const sleepStages = parseSleepStagesForDate(sleepData.dataPoints, dateLabel);
  const totalCalories = parseTotalCaloriesForDate(totalCaloriesData, dateLabel);
  const azm = parseActiveZoneMinutesForDate(activeZoneMinutesData, dateLabel);
  const rhr = parseRestingHeartRateForDate(
    restingHeartRateData.dataPoints,
    dateLabel,
  );

  const STEP_GOAL = 10_000;
  const stepGoalPercent = Math.round((steps / STEP_GOAL) * 100);

  console.log(
    `✅ [${dateLabel}] ก้าว: ${steps.toLocaleString()} (${stepGoalPercent}%) | นอน: ${sleepMinutes} นาที | แคลอรี่: ${totalCalories} kcal | Active Min: ${azm.total} นาที`,
  );
  console.log(`    ├─ 😴 Sleep Stages: Deep ${sleepStages.deep}m | REM ${sleepStages.rem}m | Light ${sleepStages.light}m | Restless ${sleepStages.restless}m | Awake ${sleepStages.awake}m`);
  console.log(`    ├─ ❤️ Heart Rate: Avg ${heartRate.avg} bpm (Min ${heartRate.min} | Max ${heartRate.max}) | RHR: ${rhr > 0 ? `${rhr} bpm` : "N/A"}`);
  console.log(`    └─ ⚡ Active Zones: FatBurn ${azm.fatBurn}m | Cardio ${azm.cardio}m | Peak ${azm.peak}m`);

  return {
    date: dateLabel,
    steps,
    stepGoalPercent,
    sleepDurationMinutes: sleepMinutes,
    sleepDurationFormatted: formatSleepDuration(sleepMinutes),
    sleepStages,
    heartRateAvg: heartRate.avg,
    heartRateMin: heartRate.min,
    heartRateMax: heartRate.max,
    totalCalories,
    activeZoneMinutesTotal: azm.total,
    activeZoneMinutesDetails: {
      fatBurn: azm.fatBurn,
      cardio: azm.cardio,
      peak: azm.peak,
    },
    restingHeartRate: rhr,
    rawData: {
      steps: stepsData,
      heartRate: heartRateData,
      sleep: sleepData,
      totalCalories: totalCaloriesData,
      activeZoneMinutes: activeZoneMinutesData,
      restingHeartRate: restingHeartRateData,
    },
  };
}

/**
 * ดึงข้อมูลสุขภาพทั้งหมดของเมื่อวาน
 */
export async function fetchYesterdayHealthData(
  accessToken: string,
): Promise<HealthData> {
  const timezone = process.env.TIMEZONE ?? "Asia/Bangkok";
  const { year, month, day, dateLabel } = getYesterdayDate(timezone);
  console.log(
    `📊 กำลังดึงข้อมูลของเมื่อวาน (${dateLabel}) จาก Google Health API v4...`,
  );
  return fetchHealthDataForDate(accessToken, dateLabel, year, month, day);
}

interface WeeklyDates {
  dateLabels: string[];
  startYear: number;
  startMonth: number;
  startDay: number;
  endYear: number;
  endMonth: number;
  endDay: number;
}

export function getWeeklyDates(timezone: string = "Asia/Bangkok"): WeeklyDates {
  const now = new Date();

  const todayLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(now);
  const [ty, tm, td] = todayLabel.split("-").map(Number);

  const dateLabels: string[] = [];
  // 7 วันที่ผ่านมา (ไม่รวมวันนี้)
  for (let i = 7; i >= 1; i--) {
    const d = new Date(Date.UTC(ty, tm - 1, td - i, 12, 0, 0));
    const label = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
    }).format(d);
    dateLabels.push(label);
  }

  const startDate = dateLabels[0];
  const endDate = dateLabels[dateLabels.length - 1];

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  return {
    dateLabels,
    startYear,
    startMonth,
    startDay,
    endYear,
    endMonth,
    endDay,
  };
}

/**
 * ดึงข้อมูลสุขภาพย้อนหลัง 7 วัน สำหรับสรุปภาพรวมรายสัปดาห์
 */
export async function fetchWeeklyHealthData(
  accessToken: string,
): Promise<HealthData[]> {
  const timezone = process.env.TIMEZONE ?? "Asia/Bangkok";
  const {
    dateLabels,
    startYear,
    startMonth,
    startDay,
    endYear,
    endMonth,
    endDay,
  } = getWeeklyDates(timezone);

  console.log(`📅 ดึงข้อมูลรายสัปดาห์: ${dateLabels[0]} ➔ ${dateLabels[6]}`);
  console.log("📊 กำลังดึงข้อมูลแบบช่วง 7 วัน...");

  const start = { date: { year: startYear, month: startMonth, day: startDay } };
  const nextEnd = buildNextDay(endYear, endMonth, endDay);
  const range = { start, end: nextEnd };

  const startDateStr = dateLabels[0];
  const endDateStr = `${nextEnd.date.year}-${String(nextEnd.date.month).padStart(2, "0")}-${String(nextEnd.date.day).padStart(2, "0")}`;

  const sleepStartMs = new Date(`${startDateStr}T18:00:00+07:00`).getTime();
  const sleepEndMs = new Date(`${endDateStr}T13:00:00+07:00`).getTime();

  // ดึงข้อมูล range ใหญ่ 1 call ต่อ 1 dataType (ลด API call)
  const stepsData = await fetchDailyRollUp(accessToken, "steps", range);
  const heartRateData = await fetchDailyRollUp(
    accessToken,
    "heart-rate",
    range,
  );
  const sleepData = await fetchSleepReconcile(
    accessToken,
    sleepStartMs,
    sleepEndMs,
    100,
  );
  const totalCaloriesData = await fetchDailyRollUp(
    accessToken,
    "total-calories",
    range,
  );
  const activeZoneMinutesData = await fetchDailyRollUp(
    accessToken,
    "active-zone-minutes",
    range,
  );
  const restingHeartRateData = await fetchRestingHeartRateReconcile(
    accessToken,
    100,
  );

  const weeklyList: HealthData[] = [];

  for (const dateLabel of dateLabels) {
    const steps = parseStepsForDate(stepsData, dateLabel);
    const heartRate = parseHeartRateForDate(heartRateData, dateLabel);
    const sleepMinutes = parseSleepMinutesForDate(
      sleepData.dataPoints,
      dateLabel,
    );
    const sleepStages = parseSleepStagesForDate(
      sleepData.dataPoints,
      dateLabel,
    );
    const totalCalories = parseTotalCaloriesForDate(
      totalCaloriesData,
      dateLabel,
    );
    const azm = parseActiveZoneMinutesForDate(activeZoneMinutesData, dateLabel);
    const rhr = parseRestingHeartRateForDate(
      restingHeartRateData.dataPoints,
      dateLabel,
    );

    const STEP_GOAL = 10_000;
    const stepGoalPercent = Math.round((steps / STEP_GOAL) * 100);

    weeklyList.push({
      date: dateLabel,
      steps,
      stepGoalPercent,
      sleepDurationMinutes: sleepMinutes,
      sleepDurationFormatted: formatSleepDuration(sleepMinutes),
      sleepStages,
      heartRateAvg: heartRate.avg,
      heartRateMin: heartRate.min,
      heartRateMax: heartRate.max,
      totalCalories,
      activeZoneMinutesTotal: azm.total,
      activeZoneMinutesDetails: {
        fatBurn: azm.fatBurn,
        cardio: azm.cardio,
        peak: azm.peak,
      },
      restingHeartRate: rhr,
      rawData: {
        steps: {
          rollupDataPoints: stepsData.rollupDataPoints.filter((p) =>
            findRollupPointForDate({ rollupDataPoints: [p] }, dateLabel),
          ),
        },
        heartRate: {
          rollupDataPoints: heartRateData.rollupDataPoints.filter((p) =>
            findRollupPointForDate({ rollupDataPoints: [p] }, dateLabel),
          ),
        },
        sleep: {
          dataPoints: sleepData.dataPoints.filter(
            (p) => parseSleepMinutesForDate([p], dateLabel) > 0,
          ),
        },
        totalCalories: {
          rollupDataPoints: totalCaloriesData.rollupDataPoints.filter((p) =>
            findRollupPointForDate({ rollupDataPoints: [p] }, dateLabel),
          ),
        },
        activeZoneMinutes: {
          rollupDataPoints: activeZoneMinutesData.rollupDataPoints.filter((p) =>
            findRollupPointForDate({ rollupDataPoints: [p] }, dateLabel),
          ),
        },
        restingHeartRate: {
          dataPoints: restingHeartRateData.dataPoints.filter(
            (p) => parseRestingHeartRateForDate([p], dateLabel) > 0,
          ),
        },
      },
    });
  }

  return weeklyList;
}
