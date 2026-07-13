# 🏃 AI Health Coach

ระบบ **AI Health Coach** ส่วนตัวที่รันอัตโนมัติทุกเช้าผ่าน **GitHub Actions**  
ดึงข้อมูลสุขภาพจาก **Google Health API v4** → วิเคราะห์ด้วย **Gemini AI** → ส่งรายงานเข้า **Discord**

---

## 📁 โครงสร้างโปรเจกต์

```
fitbit-gemini-coach/
├── .github/
│   └── workflows/
│       └── health-coach.yml  # ⏰ GitHub Actions (รันอัตโนมัติทุกเช้า + มีระบบ Retry)
├── src/
│   ├── index.ts       # 🎯 Entry point — Orchestrator หลัก
│   ├── auth.ts        # 🔑 Google OAuth token refresh
│   ├── googleFit.ts   # 📊 Google Health API v4 (ดึงข้อมูล ก้าว, นอน, ชีพจร, Active Zone, แคลอรี่)
│   ├── gemini.ts      # 🤖 Gemini AI Analysis & Weekly Trends
│   ├── discord.ts     # 📨 Discord Webhook sender (รายงานประจำวัน & สรุปประจำสัปดาห์)
│   └── types.ts       # 📐 TypeScript interfaces
├── .env.example       # 📋 ตัวอย่าง environment variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 วิธีติดตั้งและรัน (Local)

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่า Environment Variables

```bash
cp .env.example .env
# จากนั้นเปิด .env และใส่ค่าจริงทั้งหมด
```

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GEMINI_API_KEY=your-gemini-api-key
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN
TIMEZONE=Asia/Bangkok
FORCE_WEEKLY=false  # ตั้งเป็น true หากต้องการทดสอบส่งรายงานสรุปรายสัปดาห์ทันที
```

### 3. รันทดสอบ

```bash
npm run dev        # รันด้วย ts-node (ไม่ต้อง build)
```

### 4. Build & รัน Production

```bash
npm run build      # Compile TypeScript → dist/
npm start          # รัน node dist/index.js
```

### 5. รันการทดสอบ (Unit Tests)

```bash
npm run test       # รันทดสอบด้วย Vitest
```

---

## ⏰ รันอัตโนมัติด้วย GitHub Actions

ระบบใช้ **GitHub Actions Scheduled Workflow** ร่วมกับระบบแคชและอัปเดตข้อมูลอัตโนมัติ เพื่อป้องกันการส่งข้อมูลขาดหายและหลีกเลี่ยงการส่งรายงานซ้ำซ้อน

### กลไกการรันอัจฉริยะ (Smart Retry & Cache)
1. **กำหนดการรัน**: ระบบจะพยายามรันทุกเช้าที่เวลา **09:00 น., 09:30 น. และ 10:00 น. เวลาไทย** (02:00, 02:30, 03:00 UTC)
2. **การเช็กข้อมูลการนอน (Sleep Sync)**: 
   - หากรันรอบ 09:00 หรือ 09:30 น. แล้วพบเวลานอนเป็น `0` (เนื่องจากนาฬิกายังไม่ได้ซิงค์ข้อมูลกับ Google) ระบบจะ**ข้ามการส่งรายงานรอบนั้น** เพื่อรอรอบถัดไปที่ข้อมูลน่าจะพร้อม
   - ในรอบสุดท้าย (**10:00 น.**) หรือเมื่อสั่งรันแบบ Manual/Push Test ระบบจะส่งรายงานเสมอโดยไม่สนใจว่าเวลานอนจะเป็น 0 หรือไม่
3. **การป้องกันส่งซ้ำ (Caching)**: เมื่อส่งรายงานสำเร็จแล้ว ระบบจะบันทึกแคช `.health-coach-success` ในวันนั้น ๆ หาก workflow ทำงานในรอบถัดไปจะข้ามการทำงานโดยอัตโนมัติเพื่อประหยัดโควตาและไม่รบกวนใน Discord

### การทริกเกอร์แบบอื่น
- **Manual Trigger**: ไปที่หน้า **Actions -> 🏃 Daily Health Coach Report -> Run workflow**
- **Push to Test**: สั่ง push ไปที่ branch `test` (เช่น `git push origin main:test`) ระบบจะทำงานและส่งรายงานให้ทันทีโดยไม่สนแคชหรือเวลานอนว่าเป็น 0 หรือไม่

### ตั้งค่า GitHub Secrets

ไปที่ **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**  
เพิ่ม secrets ทั้ง 5 ตัว:

| Secret Name | ค่าที่ใส่ |
|-------------|----------|
| `GOOGLE_CLIENT_ID` | client_id จาก Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | client_secret จาก Google Cloud Console |
| `GOOGLE_REFRESH_TOKEN` | refresh_token ที่มีสิทธิ์ Fitness/Health API |
| `GEMINI_API_KEY` | API key จาก [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `DISCORD_WEBHOOK_URL` | Webhook URL จาก Discord Server Settings |

---

## 📦 Scripts

| Script | คำสั่ง | ใช้เมื่อไหร่ |
|--------|--------|------------|
| `dev` | `ts-node src/index.ts` | ทดสอบบน local |
| `build` | `tsc` | Compile TypeScript |
| `start` | `node dist/index.js` | รัน production (ใช้ใน GitHub Actions) |
| `build:ci` | `tsc --noEmit && tsc` | Type-check + build รวมขั้นตอนเดียว |
| `lint` | `tsc --noEmit` | ตรวจสอบ type errors ทั่วทั้งโปรเจกต์ |
| `test` | `vitest run` | รัน unit tests ทั้งหมด (รันใน GitHub Actions CI ด้วย) |
| `test:watch` | `vitest` | รัน unit tests ใน watch mode บน local |

---

## 🔒 ความปลอดภัยและการจัดการ Token

| สิ่งที่ทำ | เหตุผล |
|-----------|--------|
| Secrets เก็บใน GitHub Secrets | เข้ารหัสและ mask ในทุก log อัตโนมัติ |
| `.env` อยู่ใน `.gitignore` | ไม่ถูก commit เข้า Git เด็ดขาด |
| ใช้ `refresh_token` ไม่ใช่ `access_token` | `access_token` หมดอายุใน 1 ชม. |
| แลก token ใหม่ทุกครั้งที่รัน | ได้ token สดใหม่เสมอ โดยระบุ scope แคบที่สุดเพื่อความปลอดภัย |
| `dotenv({ override: false })` | GitHub Secrets มีความสำคัญกว่า `.env` เสมอ |

---

## 🔧 Google Health API v4 Scopes ที่ต้องการ

ระบบต้องการ OAuth Scopes ที่จำกัดที่สุดเท่าที่จำเป็นเพื่อความปลอดภัย (ห้ามระบุ scope ระดับสูงอย่าง `cloud-platform` ในการแลก Token เด็ดขาด เพราะ API จะบล็อก)

| Scope | ข้อมูลที่เข้าถึง |
|-------|----------------|
| `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` | ก้าวเดิน (Steps), พลังงานที่เผาผลาญ (Calories), นาทีในโซนออกกำลังกาย (Active Zone Minutes) |
| `https://www.googleapis.com/auth/googlehealth.sleep.readonly` | ช่วงเวลาและสถิติการนอนหลับ (Sleep) |
| `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly` | อัตราการเต้นหัวใจเฉลี่ย/ต่ำสุด/สูงสุด (Heart Rate), ชีพจรขณะพัก (Resting Heart Rate) |

---

## 📊 ตัวอย่างรายงานสุขภาพ

### 1. รายงานประจำวัน (Daily Report)
จะส่งทุกวันตอนเช้าหลังดึงและวิเคราะห์ข้อมูลเสร็จเรียบร้อย

```
🌅 Daily Health Summary

📅 รายงานสุขภาพประจำวัน: 2026-07-12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**👟 การขยับร่างกาย (ก้าวเดิน)**
`█████████░ 92%`
└─ **9,200** / 10,000 ก้าว

**😴 การนอนหลับพักผ่อน**
└─ **7 ชั่วโมง 30 นาที**

**❤️ อัตราการเต้นของหัวใจ**
├─ เฉลี่ย **72** bpm (ช่วง: 58 - 95 bpm)
└─ ชีพจรขณะพัก (RHR): **62** bpm

**⚡ Active Zone Minutes**
└─ รวม **35** นาที (Fat Burn: 20 | Cardio: 10 | Peak: 5)

**🔥 พลังงานที่เผาผลาญ**
└─ **2,350** kcal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 **บทวิเคราะห์และแนะนำโดย AI Coach**
[วิเคราะห์โดย Gemini AI ที่มีเนื้อหาสั้นกระชับ ตรงประเด็น สุภาพ อบอุ่น และเป็นมืออาชีพ]
```

### 2. รายงานสรุปประจำสัปดาห์ (Weekly Health Summary)
จะวิเคราะห์ข้อมูลย้อนหลัง 7 วันเพื่อส่งรายงานแนวโน้มสุขภาพทุก**เช้าวันจันทร์**

```
✨ Weekly Health Summary Report

📅 ช่วงวันที่: 2026-07-06 ถึง 2026-07-12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 สรุปสถิติเฉลี่ยและยอดรวมสะสม
├─ 👟 ก้าวเดินเฉลี่ยต่อวัน: **8,540** ก้าว/วัน
├─ 😴 นอนหลับเฉลี่ยต่อวัน: **7 ชั่วโมง 15 นาที**
├─ ⚡ Active Zone Minutes รวม: **180** นาที
└─ 🔥 เผาผลาญแคลอรี่รวม: **16,450** kcal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 วิเคราะห์แนวโน้มสุขภาพรายสัปดาห์
[วิเคราะห์และเปรียบเทียบแนวโน้มพฤติกรรมในรอบสัปดาห์ พร้อมคำแนะนำในการปรับปรุงจาก Gemini AI]
```
