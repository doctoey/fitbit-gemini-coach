import { describe, test, expect } from "vitest";
import {
  findRollupPointForDate,
  parseStepsForDate,
  parseHeartRateForDate,
  parseSleepMinutesForDate,
  parseTotalCaloriesForDate,
  parseActiveZoneMinutesForDate,
  parseRestingHeartRateForDate,
  parseSteps,
  parseHeartRate,
  parseSleepMinutes,
  parseTotalCalories,
  parseActiveZoneMinutes,
  parseRestingHeartRate,
  formatSleepDuration,
} from "./googleFit";
import {
  DailyRollUpResponse,
  SleepReconcileResponse,
  RestingHeartRateReconcileResponse,
} from "./types";

describe("Google Fit Parsers & Date Helpers", () => {
  // ─── Mock Data ─────────────────────────────────────────────────────────────

  const mockStepsData: DailyRollUpResponse = {
    rollupDataPoints: [
      {
        civilStartTime: { date: { year: 2026, month: 7, day: 12 } },
        civilEndTime: { date: { year: 2026, month: 7, day: 13 } },
        steps: { countSum: "8500" },
      },
      {
        civilStartTime: { date: { year: 2026, month: 7, day: 13 } },
        civilEndTime: { date: { year: 2026, month: 7, day: 14 } },
        steps: { countSum: "12000" },
      },
    ],
  };

  const mockHeartRateData: DailyRollUpResponse = {
    rollupDataPoints: [
      {
        civilStartTime: { date: { year: 2026, month: 7, day: 12 } },
        civilEndTime: { date: { year: 2026, month: 7, day: 13 } },
        heartRate: {
          beatsPerMinuteAvg: 72.4,
          beatsPerMinuteMin: 55,
          beatsPerMinuteMax: 110,
        },
      },
    ],
  };

  const mockSleepData: SleepReconcileResponse = {
    dataPoints: [
      {
        sleep: {
          interval: {
            startTime: "2026-07-12T23:00:00+07:00",
            endTime: "2026-07-13T06:30:00+07:00",
          },
          summary: {
            minutesAsleep: "410", // 6 hrs 50 mins
            minutesInSleepPeriod: "450",
            minutesAwake: "40",
          },
        },
      },
    ],
  };

  const mockCaloriesData: DailyRollUpResponse = {
    rollupDataPoints: [
      {
        civilStartTime: { date: { year: 2026, month: 7, day: 12 } },
        civilEndTime: { date: { year: 2026, month: 7, day: 13 } },
        totalCalories: { kcalSum: 2150.5 },
      },
    ],
  };

  const mockActiveZoneMinutesData: DailyRollUpResponse = {
    rollupDataPoints: [
      {
        civilStartTime: { date: { year: 2026, month: 7, day: 12 } },
        civilEndTime: { date: { year: 2026, month: 7, day: 13 } },
        activeZoneMinutes: {
          sumInFatBurnHeartZone: "25",
          sumInCardioHeartZone: "10",
          sumInPeakHeartZone: "5",
        },
      },
    ],
  };

  const mockRestingHeartRateData: RestingHeartRateReconcileResponse = {
    dataPoints: [
      {
        dailyRestingHeartRate: {
          date: { year: 2026, month: 7, day: 12 },
          beatsPerMinute: "58",
        },
      },
    ],
  };

  // ─── Tests ─────────────────────────────────────────────────────────────────

  test("findRollupPointForDate finds point matching date label", () => {
    const point = findRollupPointForDate(mockStepsData, "2026-07-12");
    expect(point).toBeDefined();
    expect(point?.steps?.countSum).toBe("8500");

    const nonExistent = findRollupPointForDate(mockStepsData, "2026-07-15");
    expect(nonExistent).toBeUndefined();
  });

  test("parseStepsForDate parses steps correctly for a specific date", () => {
    const steps = parseStepsForDate(mockStepsData, "2026-07-12");
    expect(steps).toBe(8500);

    const stepsNext = parseStepsForDate(mockStepsData, "2026-07-13");
    expect(stepsNext).toBe(12000);

    const stepsMissing = parseStepsForDate(mockStepsData, "2026-07-15");
    expect(stepsMissing).toBe(0);
  });

  test("parseSteps parses overall sum of steps", () => {
    const totalSteps = parseSteps(mockStepsData);
    expect(totalSteps).toBe(20500);
  });

  test("parseHeartRateForDate parses daily heart rate stats", () => {
    const hr = parseHeartRateForDate(mockHeartRateData, "2026-07-12");
    expect(hr.avg).toBe(72);
    expect(hr.min).toBe(55);
    expect(hr.max).toBe(110);

    const hrMissing = parseHeartRateForDate(mockHeartRateData, "2026-07-13");
    expect(hrMissing.avg).toBe(0);
    expect(hrMissing.min).toBe(0);
    expect(hrMissing.max).toBe(0);
  });

  test("parseHeartRate parses overall daily rollup data average/min/max", () => {
    const hr = parseHeartRate(mockHeartRateData);
    expect(hr.avg).toBe(72);
    expect(hr.min).toBe(55);
    expect(hr.max).toBe(110);
  });

  test("parseSleepMinutesForDate parses sleep duration minutes in date window", () => {
    const sleepMins = parseSleepMinutesForDate(
      mockSleepData.dataPoints,
      "2026-07-12",
    );
    expect(sleepMins).toBe(410);

    const sleepMinsNext = parseSleepMinutesForDate(
      mockSleepData.dataPoints,
      "2026-07-13",
    );
    expect(sleepMinsNext).toBe(0); // Falls outside Thai sleep window for 13th
  });

  test("parseSleepMinutes parses overall minutes from reconcile response", () => {
    const sleepMins = parseSleepMinutes(mockSleepData);
    expect(sleepMins).toBe(410);
  });

  test("parseTotalCaloriesForDate parses calories correctly", () => {
    const kcal = parseTotalCaloriesForDate(mockCaloriesData, "2026-07-12");
    expect(kcal).toBe(2151);

    const kcalMissing = parseTotalCaloriesForDate(
      mockCaloriesData,
      "2026-07-13",
    );
    expect(kcalMissing).toBe(0);
  });

  test("parseTotalCalories parses overall calories", () => {
    const kcal = parseTotalCalories(mockCaloriesData);
    expect(kcal).toBe(2151);
  });

  test("parseActiveZoneMinutesForDate parses zone details and total", () => {
    const azm = parseActiveZoneMinutesForDate(
      mockActiveZoneMinutesData,
      "2026-07-12",
    );
    expect(azm.total).toBe(40);
    expect(azm.fatBurn).toBe(25);
    expect(azm.cardio).toBe(10);
    expect(azm.peak).toBe(5);

    const azmMissing = parseActiveZoneMinutesForDate(
      mockActiveZoneMinutesData,
      "2026-07-13",
    );
    expect(azmMissing.total).toBe(0);
  });

  test("parseActiveZoneMinutes parses overall zone details and total", () => {
    const azm = parseActiveZoneMinutes(mockActiveZoneMinutesData);
    expect(azm.total).toBe(40);
    expect(azm.fatBurn).toBe(25);
    expect(azm.cardio).toBe(10);
    expect(azm.peak).toBe(5);
  });

  test("parseRestingHeartRateForDate parses personal resting hr", () => {
    const rhr = parseRestingHeartRateForDate(
      mockRestingHeartRateData.dataPoints,
      "2026-07-12",
    );
    expect(rhr).toBe(58);

    const rhrMissing = parseRestingHeartRateForDate(
      mockRestingHeartRateData.dataPoints,
      "2026-07-13",
    );
    expect(rhrMissing).toBe(0);
  });

  test("parseRestingHeartRate parses overall resting hr from reconcile response", () => {
    const rhr = parseRestingHeartRate(mockRestingHeartRateData);
    expect(rhr).toBe(58);
  });

  test("parseSleepMinutesForDate fallback when minutesAsleep is missing", () => {
    const mockSleepMissingMinutes = [
      {
        sleep: {
          interval: {
            startTime: "2026-07-12T23:00:00+07:00",
            endTime: "2026-07-13T06:30:00+07:00",
          },
        },
      },
    ];
    const mins = parseSleepMinutesForDate(mockSleepMissingMinutes, "2026-07-12");
    expect(mins).toBe(450);
  });

  test("parseSleepMinutes fallback when minutesAsleep is missing", () => {
    const mockSleepMissingMinutes: SleepReconcileResponse = {
      dataPoints: [
        {
          sleep: {
            interval: {
              startTime: "2026-07-12T23:00:00+07:00",
              endTime: "2026-07-13T06:30:00+07:00",
            },
          },
        },
      ],
    };
    const mins = parseSleepMinutes(mockSleepMissingMinutes);
    expect(mins).toBe(450);
  });

  test("parseRestingHeartRate returns 0 when no data points are present", () => {
    const rhr = parseRestingHeartRate({ dataPoints: [] });
    expect(rhr).toBe(0);
  });

  test("formatSleepDuration formats minutes into text correctly", () => {
    expect(formatSleepDuration(0)).toBe("ไม่มีข้อมูล");
    expect(formatSleepDuration(410)).toBe("6 ชั่วโมง 50 นาที");
    expect(formatSleepDuration(60)).toBe("1 ชั่วโมง 0 นาที");
  });
});
