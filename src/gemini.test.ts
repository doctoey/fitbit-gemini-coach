import { describe, test, expect } from "vitest";
import {
  toThaiTime,
  formatSleepForPrompt,
  buildPrompt,
  buildWeeklyPrompt,
} from "./gemini";
import { HealthData, SleepReconcileResponse } from "./types";

describe("Gemini Helper Functions", () => {
  test("toThaiTime converts UTC ISO string to Thai time format", () => {
    const utcStr = "2026-07-20T02:00:00Z"; // 09:00 in GMT+7
    expect(toThaiTime(utcStr)).toBe("09:00 น.");
  });

  test("formatSleepForPrompt returns message when sleep data is empty", () => {
    const emptySleep: SleepReconcileResponse = { dataPoints: [] };
    expect(formatSleepForPrompt(emptySleep)).toBe("ไม่มีข้อมูลการนอนหลับ");
  });

  test("formatSleepForPrompt formats sleep sessions with times and durations", () => {
    const mockSleep: SleepReconcileResponse = {
      dataPoints: [
        {
          sleep: {
            interval: {
              startTime: "2026-07-19T23:30:00+07:00",
              endTime: "2026-07-20T06:30:00+07:00",
            },
            summary: {
              minutesAsleep: "380",
            },
          },
        },
      ],
    };
    const formatted = formatSleepForPrompt(mockSleep);
    expect(formatted).toContain("เข้านอน 23:30 น. → ตื่น 06:30 น.");
    expect(formatted).toContain("รวมเวลานอนหลับ: 6 ชั่วโมง 20 นาที");
  });

  test("buildPrompt generates detailed prompt with health statistics", () => {
    const mockHealth = {
      date: "2026-07-19",
      steps: 9500,
      stepGoalPercent: 95,
      sleepDurationMinutes: 420,
      sleepDurationFormatted: "7 ชั่วโมง 0 นาที",
      sleepStages: { deep: 60, rem: 60, light: 240, awake: 60, restless: 0 },
      heartRateAvg: 72,
      heartRateMin: 55,
      heartRateMax: 110,
      totalCalories: 2100,
      activeZoneMinutesTotal: 25,
      activeZoneMinutesDetails: { fatBurn: 20, cardio: 5, peak: 0 },
      restingHeartRate: 62,
      rawData: {
        sleep: { dataPoints: [] },
      },
    } as unknown as HealthData;

    const prompt = buildPrompt(mockHealth);
    expect(prompt).toContain("ต่อไปนี้คือข้อมูลสุขภาพของผู้ใช้เมื่อวาน");
    expect(prompt).toContain("9,500 ก้าว");
    expect(prompt).toContain("7 ชั่วโมง 0 นาที");
    expect(prompt).toContain("72 bpm");
  });

  test("buildWeeklyPrompt generates detailed weekly summary prompt", () => {
    const mockWeeklyData = [
      {
        date: "2026-07-18",
        steps: 8000,
        stepGoalPercent: 80,
        sleepDurationMinutes: 480,
        sleepDurationFormatted: "8 ชั่วโมง 0 นาที",
        activeZoneMinutesTotal: 15,
        totalCalories: 2000,
        restingHeartRate: 60,
        heartRateAvg: 70,
        heartRateMin: 50,
        heartRateMax: 100,
      },
      {
        date: "2026-07-19",
        steps: 12000,
        stepGoalPercent: 120,
        sleepDurationMinutes: 360,
        sleepDurationFormatted: "6 ชั่วโมง 0 นาที",
        activeZoneMinutesTotal: 30,
        totalCalories: 2200,
        restingHeartRate: 62,
        heartRateAvg: 72,
        heartRateMin: 52,
        heartRateMax: 102,
      },
    ] as unknown as HealthData[];

    const prompt = buildWeeklyPrompt(mockWeeklyData);
    expect(prompt).toContain("สรุปรวมรายสัปดาห์");
    expect(prompt).toContain("ก้าวเดินเฉลี่ยต่อวัน: 10,000 ก้าว");
    expect(prompt).toContain("นอนหลับเฉลี่ยต่อวัน: 7 ชั่วโมง 0 นาที");
  });
});
