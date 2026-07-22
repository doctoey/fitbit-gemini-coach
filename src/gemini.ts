// src/gemini.ts
// ส่งข้อมูลสุขภาพให้ Gemini AI วิเคราะห์และสรุปแบบ AI Coach ภาษาไทย

import axios from "axios";
import {
  GeminiRequest,
  GeminiResponse,
  HealthData,
  SleepReconcileResponse,
} from "./types";

// โมเดลล่าสุดของ Gemini — อัปเดตจาก models list (July 2026)
// Ref: GET https://generativelanguage.googleapis.com/v1beta/models?key=...
const GEMINI_MODEL = "gemini-3.5-flash-lite"; // Fast, high free tier quota model (500 RPD)
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** แปลง UTC ISO string เป็นเวลาไทย (Bangkok GMT+7) รูปแบบ HH:MM น. */
export function toThaiTime(utcStr: string): string {
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
export function formatSleepForPrompt(data: SleepReconcileResponse): string {
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
export function buildPrompt(health: HealthData): string {
  const sleepFormatted = formatSleepForPrompt(health.rawData.sleep);
  const stages = health.sleepStages;
  let sleepStagesStr = "ไม่มีข้อมูล Sleep Stages";
  if (stages) {
    sleepStagesStr = `Deep Sleep ${stages.deep} นาที, REM Sleep ${stages.rem} นาที, Light Sleep ${stages.light} นาที, Restlessness ${stages.restless} นาที, Awake ${stages.awake} นาที`;
  }

  return `คุณคือผู้เชี่ยวชาญด้านสุขภาพและที่ปรึกษาส่วนตัว (Health Coach) ที่ให้คำแนะนำอย่างอบอุ่น สุภาพ และเป็นมิตร

ต่อไปนี้คือข้อมูลสุขภาพของผู้ใช้เมื่อวาน (${health.date}):

## ข้อมูลสรุป
- จำนวนก้าว: ${health.steps.toLocaleString()} ก้าว (${health.stepGoalPercent}% ของเป้าหมาย 10,000 ก้าว)
- เวลานอน: ${health.sleepDurationFormatted} (${sleepStagesStr})
- อัตราการเต้นหัวใจเฉลี่ย: ${health.heartRateAvg} bpm (ต่ำสุด ${health.heartRateMin} | สูงสุด ${health.heartRateMax})
- พลังงานที่เผาผลาญ: ${health.totalCalories} kcal
- Active Zone Minutes: ${health.activeZoneMinutesTotal} นาที (Fat Burn: ${health.activeZoneMinutesDetails.fatBurn} นาที, Cardio: ${health.activeZoneMinutesDetails.cardio} นาที, Peak: ${health.activeZoneMinutesDetails.peak} นาที)
- ชีพจรขณะพัก (Resting HR): ${health.restingHeartRate > 0 ? `${health.restingHeartRate} bpm` : "ไม่มีข้อมูล"}

## ช่วงเวลานอนหลับ (เวลาประเทศไทย GMT+7)
${sleepFormatted}

## งานของคุณ
กรุณาวิเคราะห์ข้อมูลสุขภาพข้างต้นและเขียนรายงานสรุปด้วยน้ำเสียงที่สุภาพ อบอุ่น เป็นมิตร และมีความเป็นมืออาชีพ โดยเน้นความ กระชับ ตรงประเด็น ไม่เยิ่นเย้อ โดยมีโครงสร้างการนำเสนอดังนี้:

1. คำทักทาย: ทักทายสั้นๆ และเปิดประเด็นเข้าสู่การดูรายงานอย่างอบอุ่นและกระชับ
2. จุดที่ทำได้ดี: ชื่นชมพฤติกรรมที่ดีอย่างสมเหตุสมผลและสั้นกระชับ นำหน้าด้วยเครื่องหมายขีดแดช (-)
3. การวิเคราะห์: อธิบายสถิติตัวชี้วัดต่างๆ ด้วยภาษาที่สั้นกระชับ เข้าใจง่าย ตรงประเด็น นำหน้าด้วยเครื่องหมายขีดแดช (-)
4. คำแนะนำ: แนะนำสิ่งที่ควรทำในวันนี้ 2-3 ข้อสั้นๆ ที่ทำได้จริง นำหน้าด้วยเครื่องหมายขีดแดช (-) และย่อยรายการข้างใน
5. กำลังใจ: ปิดท้ายด้วยการให้กำลังใจสั้นๆ อย่างจริงใจ

ข้อกำหนดที่เข้มงวดเพื่อโครงสร้างแบบ Bullet-focused และ Minimal:
- ห้ามใช้คำว่า "คุณลูกค้า" เด็ดขาด ให้ใช้คำว่า "คุณ" หรือละเว้นสรรพนามหากประโยคอ่านลื่นหูอยู่แล้ว
- รูปแบบตัวเลข (สำคัญที่สุด): ให้แสดงสถิติและตัวเลขเป็น "ตัวเลขอารบิก" เสมอ (เช่น 2,519 kcal, 71 ครั้งต่อนาที, 22:00 - 23:00 น.) ห้ามเขียนสะกดเป็นตัวหนังสือ (เช่น ห้ามเขียน "สองพัน...", "เจ็ดสิบ...") เด็ดขาด
- ห้ามใช้อิโมจิในบทวิเคราะห์โดยเด็ดขาดในทุกจุด (เน้นโทนสะอาด คลีน เรียบง่าย)
- ห้ามใส่หัวข้อใหญ่ และห้ามใช้ Markdown ตัวหนา (เช่น **จุดที่ทำได้ดี:**) หรือเครื่องหมายขีดคั่นใดๆ ทั้งสิ้นในเนื้อหาบทวิเคราะห์
- โครงสร้างและย่อหน้า (เข้มงวดมาก): 
  - บรรทัดแรกสุด: เขียนคำทักทายสั้นๆ จากนั้นเว้นบรรทัดว่าง 1 บรรทัด (Double Newline)
  - บรรทัดถัดมา: แสดงเนื้อหา "จุดที่ทำได้ดี" โดยขึ้นต้นด้วย "- จุดที่ทำได้ดี: " แล้วเขียนข้อความต่อท้ายในบรรทัดเดียวกัน จากนั้นเว้นบรรทัดว่าง 1 บรรทัด
  - บรรทัดถัดมา: แสดงเนื้อหา "การวิเคราะห์" โดยขึ้นต้นด้วย "- การวิเคราะห์: " แล้วเขียนข้อความต่อท้ายในบรรทัดเดียวกัน จากนั้นเว้นบรรทัดว่าง 1 บรรทัด
  - บรรทัดถัดมา: แสดงส่วน "คำแนะนำ" โดยเริ่มบรรทัดด้วย "- คำแนะนำสำหรับวันนี้: " จากนั้นให้ขึ้นบรรทัดใหม่และย่อหน้าเข้าไปเล็กน้อยเพื่อแสดงรายการคำแนะนำย่อย 2-3 ข้อโดยใช้เครื่องหมายขีดแดช (-) นำหน้า (เช่น - ปรับเวลาเข้านอนเป็นช่วง 22:00 - 23:00 น....) ห้ามใช้ Markdown ตัวหนาในข้อคำแนะนำย่อย และระบุตัวเลขเวลา/เป้าหมายเชิงรูปธรรมที่ชัดเจนในคำแนะนำ เมื่อจบส่วนนี้ให้เว้นบรรทัดว่าง 1 บรรทัด
  - บรรทัดสุดท้าย: เขียนข้อความให้กำลังใจปิดท้ายสั้นๆ
- ในเนื้อหาของข้อการวิเคราะห์ ให้ระบุช่วงเวลาเข้านอนและตื่นนอน (เช่น เข้านอนเวลา XX:XX น. และตื่นนอนเวลา YY:YY น.) จากข้อมูลช่วงเวลานอนหลับที่ให้ไว้ด้วยทุกครั้ง
- ห้ามใช้คำลงท้ายหรือคำสร้อยที่ฟุ่มเฟือยซ้ำซาก (เช่น ยอดเยี่ยมมากครับ, เลยทีเดียวครับ) ให้กระชับ สุภาพ และจริงใจ
- ความยาวรวมจำกัดที่ 180-250 คำ เท่านั้น`;
}

export function buildWeeklyPrompt(weeklyData: HealthData[]): string {
  const dateRangeStr = `${weeklyData[0].date} ถึง ${weeklyData[weeklyData.length - 1].date}`;

  const dailySummaryTable = [
    "| วันที่ | จำนวนก้าว | เวลานอน | ชีพจรเฉลี่ย (ช่วง) | ชีพจรขณะพัก (RHR) | แคลอรี่ (kcal) | Active Mins |",
    "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    ...weeklyData.map((d) => {
      const rhrStr =
        d.restingHeartRate > 0 ? `${d.restingHeartRate} bpm` : "ไม่มีข้อมูล";
      return `| ${d.date} | ${d.steps.toLocaleString()} ก้าว (${d.stepGoalPercent}%) | ${d.sleepDurationFormatted} | ${d.heartRateAvg} bpm (${d.heartRateMin}-${d.heartRateMax}) | ${rhrStr} | ${d.totalCalories} | ${d.activeZoneMinutesTotal} นาที |`;
    }),
  ].join("\n");

  const totalSteps = weeklyData.reduce((sum, d) => sum + d.steps, 0);
  const avgSteps = Math.round(totalSteps / weeklyData.length);
  const totalActiveMins = weeklyData.reduce(
    (sum, d) => sum + d.activeZoneMinutesTotal,
    0,
  );
  const totalCalories = weeklyData.reduce((sum, d) => sum + d.totalCalories, 0);
  const avgSleepMins = Math.round(
    weeklyData.reduce((sum, d) => sum + d.sleepDurationMinutes, 0) /
      weeklyData.length,
  );
  const avgSleepFormatted = `${Math.floor(avgSleepMins / 60)} ชั่วโมง ${avgSleepMins % 60} นาที`;

  return `คุณคือผู้เชี่ยวชาญด้านสุขภาพและที่ปรึกษาส่วนตัว (Health Coach) ที่ให้คำแนะนำอย่างอบอุ่น สุภาพ และเป็นมิตร

ต่อไปนี้คือข้อมูลสุขภาพโดยรวมรายสัปดาห์ของผู้ใช้ (${dateRangeStr}):

## ตารางข้อมูลรายวัน
${dailySummaryTable}

## สรุปรวมรายสัปดาห์
- ก้าวเดินเฉลี่ยต่อวัน: ${avgSteps.toLocaleString()} ก้าว
- นอนหลับเฉลี่ยต่อวัน: ${avgSleepFormatted}
- Active Zone Minutes รวมทั้งสัปดาห์: ${totalActiveMins} นาที
- เผาผลาญพลังงานรวมทั้งสัปดาห์: ${totalCalories.toLocaleString()} kcal

## งานของคุณ
กรุณาวิเคราะห์แนวโน้มสุขภาพของผู้ใช้ตลอดสัปดาห์ที่ผ่านมา และเขียนรายงานสรุปภาพรวมรายสัปดาห์ (Weekly Report) ด้วยน้ำเสียงที่สุภาพ อบอุ่น เป็นมิตร และเป็นมืออาชีพ โดยเน้นความ กระชับ ตรงประเด็น และมีโครงสร้างดังนี้:

1. คำทักทาย: ทักทายสั้นๆ และเปิดประเด็นเข้าสู่รายงานสรุปประจำสัปดาห์อย่างอบอุ่น
2. ภาพรวมสัปดาห์นี้: สรุปภาพรวมสัปดาห์สั้นๆ
3. จุดเด่น / พัฒนาการที่ดี: ชื่นชมพฤติกรรมที่ดีหรือเป้าหมายที่ทำสำเร็จ
4. แนวโน้มและวิเคราะห์: วิเคราะห์ความสัมพันธ์ของข้อมูลตลอดทั้งสัปดาห์
5. คำแนะนำ/เป้าหมายสำหรับสัปดาห์ถัดไป: ให้คำแนะนำหรือเป้าหมายท้าทายเล็กๆ 2-3 ข้อสั้นๆ ที่ทำได้จริง
6. คำลงท้ายและกำลังใจ: คำพูดปิดท้ายให้กำลังใจสำหรับสัปดาห์ใหม่สั้นๆ อย่างจริงใจ

ข้อกำหนดที่เข้มงวดเพื่อความสวยงามในรูปแบบ Minimal:
- ห้ามใช้คำว่า "คุณลูกค้า" เด็ดขาด ให้ใช้คำว่า "คุณ" หรือละเว้นสรรพนาม
- ห้ามใช้อิโมจิในบทวิเคราะห์โดยเด็ดขาดในทุกจุด (เพื่อรักษาโทนสีและดีไซน์ให้สะอาด คลีน)
- การแบ่งส่วนหัวข้อ: ให้ใช้ Markdown ตัวหนาครอบชื่อหัวข้อหลักเท่านั้น โดยระบุชื่อหัวข้อตรงๆ ดังนี้: **ภาพรวมสัปดาห์นี้**, **จุดเด่นและพัฒนาการที่ดี**, **แนวโน้มและการวิเคราะห์**, และ **คำแนะนำสำหรับสัปดาห์ถัดไป** โดยการขึ้นต้นบรรทัดใหม่แยกจากเนื้อหา
- ในเนื้อหาภายในแต่ละส่วน: ห้ามแตกบรรทัดย่อยเป็นข้อยิบย่อย ให้เขียนเนื้อหาร้อยเรียงกันเป็นพารากราฟสั้นๆ ที่ลื่นไหลต่อเนื่องกันเพื่อความเป็นระเบียบ
- ห้ามใช้เครื่องหมายอัศเจรีย์ (!) ในคำลงท้าย เพื่อรักษาโทนเสียงที่เป็นมืออาชีพ
- ความยาวรวมประมาณ 200-300 คำ เท่านั้น`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGeminiApi(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("❌ ขาด environment variable: GEMINI_API_KEY");
  }

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const requestBody: GeminiRequest = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  };

  const MAX_RETRIES = 3;
  let delay = 2000;
  let response;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await axios.post<GeminiResponse>(url, requestBody, {
        headers: { "Content-Type": "application/json" },
      });
      break;
    } catch (err) {
      const isAxiosError = axios.isAxiosError(err);
      const status = isAxiosError ? err.response?.status : null;

      console.warn(
        `⚠️ [Attempt ${attempt}/${MAX_RETRIES}] Gemini API ขัดข้อง (Status: ${status ?? "Unknown"})`,
      );

      if (isAxiosError && err.response) {
        console.error("   Detail:", JSON.stringify(err.response.data, null, 2));
      }

      if (
        (status === 503 || status === 429 || !status) &&
        attempt < MAX_RETRIES
      ) {
        console.log(`   กำลังลองใหม่ในอีก ${delay / 1000} วินาที...`);
        await sleep(delay);
        delay *= 2;
        continue;
      }

      throw err;
    }
  }

  if (!response) {
    throw new Error(
      "❌ ไม่สามารถดึงข้อมูลวิเคราะห์จาก Gemini ได้สำเร็จหลังจากพยายามใหม่",
    );
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

/**
 * ส่งข้อมูลสุขภาพให้ Gemini วิเคราะห์รายวัน
 */
export async function analyzeWithGemini(health: HealthData): Promise<string> {
  console.log(
    `🤖 กำลังส่งข้อมูลให้ Gemini (${GEMINI_MODEL}) วิเคราะห์รายวัน...`,
  );
  const prompt = buildPrompt(health);
  return callGeminiApi(prompt);
}

/**
 * ส่งข้อมูลสุขภาพแบบ 7 วันให้ Gemini วิเคราะห์แนวโน้มรายสัปดาห์
 */
export async function analyzeWeeklyTrends(
  weeklyData: HealthData[],
): Promise<string> {
  console.log(
    `🤖 กำลังส่งข้อมูลให้ Gemini (${GEMINI_MODEL}) วิเคราะห์แนวโน้มรายสัปดาห์...`,
  );
  const prompt = buildWeeklyPrompt(weeklyData);
  return callGeminiApi(prompt);
}
