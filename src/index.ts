// src/index.ts
// Entry point หลัก — Orchestrator ที่รวมทุก module เข้าด้วยกัน

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

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

  // ตรวจสอบข้อมูลการนอนหลับ (Sleep)
  const isLastAttempt = process.env.LAST_ATTEMPT === "true";
  if (healthData.sleepDurationMinutes === 0 && !isLastAttempt) {
    console.log("\n⚠️ พบเวลานอนเป็น 0 คาดว่ายังไม่ได้ซิงค์ข้อมูล (จะข้ามการส่งรายงานรอบนี้เพื่อรอรอบถัดไป)");
    console.log("━".repeat(50));
    console.log("🎉 ทำงานเสร็จสิ้น (ข้ามการส่งรายงาน)!");
    console.log("━".repeat(50));
    return;
  }

  // 4. ส่งให้ Gemini วิเคราะห์
  const analysis = await analyzeWithGemini(healthData);

  // 5. ส่งเข้า Discord
  await sendToDiscord(healthData, analysis);

  // บันทึกสถานะเพื่อบอก GitHub Actions ว่ารันสำเร็จและส่งรายงานเรียบร้อยแล้ว
  if (process.env.GITHUB_OUTPUT) {
    const cacheDir = path.join(process.cwd(), ".health-coach-success");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(cacheDir, "marker.txt"),
      `Success at ${new Date().toISOString()}`
    );
    fs.appendFileSync(process.env.GITHUB_OUTPUT, "should_cache=true\n");
    console.log("📝 บันทึกสถานะการส่งรายงานเข้า GITHUB_OUTPUT เรียบร้อย");
  }

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
