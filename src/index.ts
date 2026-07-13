// src/index.ts
// Entry point หลัก — Orchestrator ที่รวมทุก module เข้าด้วยกัน

import dotenv from "dotenv";

// โหลด .env ถ้ามีไฟล์ (local dev)
// บน GitHub Actions: env vars ถูก inject จาก Secrets โดยอัตโนมัติ ไม่ต้องมีไฟล์ .env
dotenv.config({ override: false }); // override: false = ไม่ทับค่าที่ runner inject มาแล้ว

import { getAccessToken } from "./auth";
import { fetchYesterdayHealthData, fetchWeeklyHealthData } from "./googleFit";
import { analyzeWithGemini, analyzeWeeklyTrends } from "./gemini";
import {
  sendToDiscord,
  sendErrorToDiscord,
  sendWeeklyReportToDiscord,
} from "./discord";

// ─── Validation ──────────────────────────────────────────────────────────────

function validateEnvironment(): void {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "GEMINI_API_KEY",
    "DISCORD_WEBHOOK_URL",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `❌ ขาด environment variables ต่อไปนี้:\n${missing.map((k) => `  • ${k}`).join("\n")}\n\nกรุณาคัดลอก .env.example เป็น .env และใส่ค่าให้ครบ`,
    );
  }
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("━".repeat(50));
  console.log("🏃 AI Health Coach — เริ่มทำงาน");
  console.log(`⏰ เวลา: ${new Date().toLocaleString("th-TH")}`);
  console.log("━".repeat(50));

  // 1. ตรวจสอบ environment variables
  validateEnvironment();

  // 2. แลก refresh_token → access_token
  const accessToken = await getAccessToken();

  // 3. ดึงข้อมูลสุขภาพเมื่อวาน
  const healthData = await fetchYesterdayHealthData(accessToken);

  // 4. ส่งให้ Gemini วิเคราะห์
  const analysis = await analyzeWithGemini(healthData);

  // 5. ส่งเข้า Discord
  await sendToDiscord(healthData, analysis);

  // 6. ตรวจสอบเงื่อนไขการส่งรายงานประจำสัปดาห์ (ทุกเช้าวันจันทร์ หรือเมื่อมีการบังคับ)
  const timezone = process.env.TIMEZONE ?? "Asia/Bangkok";
  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(new Date());
  const isMonday =
    dayOfWeek === "Monday" || process.env.FORCE_WEEKLY === "true";

  if (isMonday) {
    console.log("\n" + "━".repeat(50));
    console.log("📊 เริ่มสร้างรายงานสรุปประจำสัปดาห์ (Weekly Health Summary)");
    console.log("━".repeat(50));

    // ดึงข้อมูลย้อนหลัง 7 วัน
    const weeklyData = await fetchWeeklyHealthData(accessToken);

    // วิเคราะห์ด้วย Gemini
    const weeklyAnalysis = await analyzeWeeklyTrends(weeklyData);

    // ส่งรายงานรายสัปดาห์เข้า Discord
    await sendWeeklyReportToDiscord(weeklyData, weeklyAnalysis);
  }

  console.log("━".repeat(50));
  console.log("🎉 ทำงานเสร็จสิ้น!");
  console.log("━".repeat(50));
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch(async (error: Error) => {
  console.error("\n❌ เกิดข้อผิดพลาด:", error.message);

  // พยายามส่ง error notification เข้า Discord
  await sendErrorToDiscord(error);

  process.exit(1);
});
