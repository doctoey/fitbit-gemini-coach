// src/gemini.ts
// ส่งข้อมูลสุขภาพให้ Gemini AI วิเคราะห์และสรุปแบบ AI Coach ภาษาไทย

import axios from "axios";
import { GeminiRequest, GeminiResponse, HealthData } from "./types";

// โมเดลล่าสุดของ Gemini — อัปเดตจาก models list (July 2026)
// Ref: GET https://generativelanguage.googleapis.com/v1beta/models?key=...
const GEMINI_MODEL = "gemini-3.5-flash"; // Newest Flash (May 2026), supports generateContent
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** แปลง UTC ISO string เป็นเวลาไทย (Bangkok GMT+7) รูปแบบ HH:MM น. */
function toThaiTime(utcStr: string): string {
  return (
    new Date(utcStr).toLocaleTimeString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " น."
  );
}

/** สรุป sleep sessions เป็น text ที่ Gemini อ่านได้ถูกต้อง (เวลาไทยแล้ว) */
function formatSleepForPrompt(
  data: import("./types").SleepReconcileResponse,
): string {
  const points = data.dataPoints ?? [];
  if (points.length === 0) return "ไม่มีข้อมูลการนอนหลับ";

  return points
    .map((point) => {
      const p = point as Record<string, unknown>;
      const sleepObj = p["sleep"] as Record<string, unknown> | undefined;
      const interval = sleepObj?.["interval"] as
        | Record<string, unknown>
        | undefined;
      const summary = sleepObj?.["summary"] as
        | Record<string, unknown>
        | undefined;

      const startUtc = interval?.["startTime"] as string | undefined;
      const endUtc = interval?.["endTime"] as string | undefined;
      const minutesAsleep = summary?.["minutesAsleep"] ?? "?";

      const startThai = startUtc ? toThaiTime(startUtc) : "?";
      const endThai = endUtc ? toThaiTime(endUtc) : "?";

      let durationText = "";
      if (minutesAsleep !== "?") {
        const m = parseInt(String(minutesAsleep), 10);
        const h = Math.floor(m / 60);
        const mins = m % 60;
        durationText = h > 0 ? `${h} ชั่วโมง ${mins} นาที` : `${mins} นาที`;
      } else {
        durationText = "ไม่มีข้อมูล";
      }

      return `เข้านอน ${startThai} → ตื่น ${endThai} (รวมเวลานอนหลับ: ${durationText})`;
    })
    .join("\n");
}

/**
 * สร้าง prompt ที่ละเอียดและมีบริบทสำหรับ Gemini
 * รวมทั้งข้อมูล summary + raw JSON เพื่อให้ AI วิเคราะห์ได้ลึก
 */
function buildPrompt(health: HealthData): string {
  const rawJson = JSON.stringify(
    {
      steps: health.rawData.steps,
      heartRate: health.rawData.heartRate,
      sleep: health.rawData.sleep,
    },
    null,
    2,
  );

  const sleepFormatted = formatSleepForPrompt(health.rawData.sleep);

  return `คุณคือผู้เชี่ยวชาญด้านสุขภาพและที่ปรึกษาส่วนตัว (Health Coach) ที่ให้คำแนะนำอย่างอบอุ่น สุภาพ และเป็นมิตร

ต่อไปนี้คือข้อมูลสุขภาพของผู้ใช้เมื่อวาน (${health.date}):

## ข้อมูลสรุป
- 👟 จำนวนก้าว: ${health.steps.toLocaleString()} ก้าว (${health.stepGoalPercent}% ของเป้าหมาย 10,000 ก้าว)
- 😴 เวลานอน: ${health.sleepDurationFormatted}
- ❤️  อัตราการเต้นหัวใจเฉลี่ย: ${health.heartRateAvg} bpm (ต่ำสุด ${health.heartRateMin} | สูงสุด ${health.heartRateMax})

## ช่วงเวลานอนหลับ (เวลาประเทศไทย GMT+7 แล้ว — ใช้ข้อมูลชุดนี้ในการวิเคราะห์)
${sleepFormatted}

## ข้อมูล JSON ดิบจาก Google Fit
⚠️ หมายเหตุ: เวลาทั้งหมดใน JSON นี้เป็น UTC — ต้องบวก 7 ชั่วโมงเพื่อแปลงเป็นเวลาไทย
\`\`\`json
${rawJson}
\`\`\`

## งานของคุณ
กรุณาวิเคราะห์ข้อมูลสุขภาพข้างต้นและเขียนรายงานสรุปด้วยน้ำเสียงที่สุภาพ อบอุ่น และเป็นธรรมชาติ โดยมีโครงสร้างดังนี้:

1. **คำทักทาย**: ทักทายอย่างสุภาพและเปิดประเด็นเข้าสู่การดูรายงานของเมื่อวานอย่างเป็นธรรมชาติ (เช่น "สวัสดีครับ วันนี้เรามาดูรายละเอียดสุขภาพของเมื่อวานกันนะครับ")
2. **จุดที่ทำได้ดี**: ชื่นชมพฤติกรรมที่ดีอย่างสมเหตุสมผล (เช่น คุณภาพการนอนหลับลึก หรือการขยับร่างกาย)
3. **การวิเคราะห์**: อธิบายข้อมูลแต่ละตัวชี้วัด (ก้าวเดิน, การนอนหลับ, ชีพจร) ด้วยภาษาที่เข้าใจง่าย ไม่เป็นวิชาการจนเกินไป แต่ดูน่าเชื่อถือ
4. **คำแนะนำและข้อควรระวัง**: แนะนำแนวทางปรับปรุงตัวสั้นๆ 2-3 ข้อที่สามารถเริ่มทำได้จริงในวันนี้
5. **กำลังใจ**: ปิดท้ายด้วยการให้กำลังใจอย่างจริงใจและนุ่มนวล

**ข้อกำหนดที่เข้มงวด:**
- ห้ามใช้คำลงท้ายหรือคำอุทานที่ดูฝืนหรือเป็นวัยรุ่นเกินไป เช่น "โค้ชมาแล้ววว", "โย่ววว", "เนอะ", "นะค้าบ"
- ใช้สรรพนามสุภาพ เช่น "คุณ" หรือไม่จำเป็นต้องใส่สรรพนามหากประโยคสละสลวยอยู่แล้ว
- **สำคัญ: ใช้ "ช่วงเวลานอนหลับ" ที่แปลงเป็นเวลาไทยแล้วในการวิเคราะห์** ห้ามอ้างอิงเวลา UTC จาก JSON โดยตรง
- ใช้อิโมจิประกอบได้เล็กน้อยเพื่อความสบายตา แต่ห้ามใช้เยอะจนรก
- ความยาวรวมประมาณ 200-300 คำ
- ตอบเฉพาะเนื้อหาวิเคราะห์ ห้ามใส่หัวข้อหรือ markdown ที่ไม่จำเป็น (เช่น ห้ามใส่พาดหัวบิ๊กๆ หรือเครื่องหมายขีดคั่นซ้ำซ้อน เพราะระบบมีโครงสร้างหลักอยู่แล้ว)`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ส่งข้อมูลสุขภาพให้ Gemini วิเคราะห์ (พร้อมกลไก Retry เผื่อเจอ Error 503 / 429)
 * คืน string ที่พร้อมส่งไป Discord
 */
export async function analyzeWithGemini(health: HealthData): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("❌ ขาด environment variable: GEMINI_API_KEY");
  }

  console.log(`🤖 กำลังส่งข้อมูลให้ Gemini (${GEMINI_MODEL}) วิเคราะห์...`);

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const requestBody: GeminiRequest = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(health) }],
      },
    ],
    generationConfig: {
      temperature: 0.8, // ให้ตอบสร้างสรรค์และไม่ซ้ำซาก
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
      // Disable thinking เพื่อลด latency และค่าใช้จ่าย
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  // log URL เพื่อให้ debug ได้ถ้า 404 (ไม่ log apiKey จริง เพื่อ security)
  const urlForLog = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=***`;
  console.log(`   URL: ${urlForLog}`);

  const MAX_RETRIES = 3;
  let delay = 2000; // เริ่มต้นหน่วงเวลา 2 วินาที
  let response;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await axios.post<GeminiResponse>(url, requestBody, {
        headers: { "Content-Type": "application/json" },
      });
      // ถ้าผ่านให้ออกลูปทันที
      break;
    } catch (err) {
      const isAxiosError = axios.isAxiosError(err);
      const status = isAxiosError ? err.response?.status : null;
      
      console.warn(`⚠️ [Attempt ${attempt}/${MAX_RETRIES}] Gemini API ขัดข้อง (Status: ${status ?? "Unknown"})`);

      if (isAxiosError && err.response) {
        console.error("   Detail:", JSON.stringify(err.response.data, null, 2));
      }

      // ถ้าเป็นความผิดพลาดชั่วคราว (เช่น 503 หรือ 429) และยังไม่ครบจำนวนรอบ ให้ลองใหม่
      if ((status === 503 || status === 429 || !status) && attempt < MAX_RETRIES) {
        console.log(`   กำลังลองใหม่ในอีก ${delay / 1000} วินาที...`);
        await sleep(delay);
        delay *= 2; // เพิ่มเวลารอเป็น 2 เท่า (Exponential Backoff)
        continue;
      }

      // ถ้าเป็น error ชนิดอื่น (เช่น 400, 403, 404) หรือรันจนครบ 3 รอบแล้วยังเฟล ให้ throw error ทันที
      throw err;
    }
  }

  if (!response) {
    throw new Error("❌ ไม่สามารถดึงข้อมูลวิเคราะห์จาก Gemini ได้สำเร็จหลังจากพยายามใหม่");
  }

  const candidate = response.data.candidates?.[0];
  if (!candidate) {
    throw new Error("❌ Gemini ไม่ส่งผลลัพธ์กลับมา");
  }

  const text = candidate.content.parts?.[0]?.text ?? "";
  if (!text) {
    throw new Error("❌ Gemini ส่งผลลัพธ์กลับมาแต่ไม่มีข้อความ");
  }

  const usage = response.data.usageMetadata;
  console.log(
    `✅ Gemini วิเคราะห์เสร็จ (${usage?.totalTokenCount ?? "?"} tokens)`,
  );

  return text.trim();
}

