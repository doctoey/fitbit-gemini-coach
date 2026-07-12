// src/index.ts
// Entry point หลัก — Orchestrator ที่รวมทุก module เข้าด้วยกัน

import dotenv from "dotenv";

// โหลด .env ก่อนทุกอย่าง
dotenv.config();

import { getAccessToken } from "./auth";
import { fetchYesterdayHealthData } from "./googleFit";
import { analyzeWithGemini } from "./gemini";
import { sendToDiscord, sendErrorToDiscord } from "./discord";

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
      `❌ ขาด environment variables ต่อไปนี้:\n${missing.map((k) => `  • ${k}`).join("\n")}\n\nกรุณาคัดลอก .env.example เป็น .env และใส่ค่าให้ครบ`
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
