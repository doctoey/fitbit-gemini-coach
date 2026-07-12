# 🏃 AI Health Coach

ระบบ **AI Health Coach** ส่วนตัวที่รันอัตโนมัติทุกเช้าผ่าน **GitHub Actions**  
ดึงข้อมูลจาก **Google Fit** → วิเคราะห์ด้วย **Gemini AI** → ส่งรายงานเข้า **Discord**

---

## 📁 โครงสร้างโปรเจกต์

```
fitbit-gemini-coach/
├── .github/
│   └── workflows/
│       └── health-coach.yml  # ⏰ GitHub Actions (รันทุกวัน 09:00 น. ไทย)
├── src/
│   ├── index.ts       # 🎯 Entry point — Orchestrator หลัก
│   ├── auth.ts        # 🔑 Google OAuth token refresh
│   ├── googleFit.ts   # 📊 Google Fit REST API (steps, sleep, heart rate)
│   ├── gemini.ts      # 🤖 Gemini AI Analysis
│   ├── discord.ts     # 📨 Discord Webhook sender
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

---

## ⏰ รันอัตโนมัติด้วย GitHub Actions

ระบบใช้ **GitHub Actions Scheduled Workflow** แทน cron job บนเครื่อง ไม่ต้องเปิดคอมพิวเตอร์ทิ้งไว้

**กำหนดการ:** ทุกวัน **09:00 น. เวลาไทย** (= 02:00 UTC)

### ตั้งค่า GitHub Secrets

ไปที่ **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**  
เพิ่ม secrets ทั้ง 5 ตัว:

| Secret Name | ค่าที่ใส่ |
|-------------|----------|
| `GOOGLE_CLIENT_ID` | client_id จาก Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | client_secret จาก Google Cloud Console |
| `GOOGLE_REFRESH_TOKEN` | refresh_token ที่มีสิทธิ์ Fitness API |
| `GEMINI_API_KEY` | API key จาก [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `DISCORD_WEBHOOK_URL` | Webhook URL จาก Discord Server Settings |

### ทดสอบรัน Workflow ทันที

ไปที่ **GitHub Repo → Actions → 🏃 Daily Health Coach Report → Run workflow**

---

## 📦 Scripts

| Script | คำสั่ง | ใช้เมื่อไหร่ |
|--------|--------|------------|
| `dev` | `ts-node src/index.ts` | ทดสอบบน local |
| `build` | `tsc` | Compile TypeScript |
| `start` | `node dist/index.js` | รัน production (ใช้ใน GitHub Actions) |
| `build:ci` | `tsc --noEmit && tsc` | Type-check + build รวมขั้นตอนเดียว |
| `lint` | `tsc --noEmit` | ตรวจ type errors |

---

## 🔒 ความปลอดภัย

| สิ่งที่ทำ | เหตุผล |
|-----------|--------|
| Secrets เก็บใน GitHub Secrets | เข้ารหัสและ mask ในทุก log อัตโนมัติ |
| `.env` อยู่ใน `.gitignore` | ไม่ถูก commit เข้า Git เด็ดขาด |
| ใช้ `refresh_token` ไม่ใช่ `access_token` | `access_token` หมดอายุใน 1 ชม. |
| แลก token ใหม่ทุกครั้งที่รัน | ได้ token สดใหม่เสมอ |
| `dotenv({ override: false })` | GitHub Secrets มีความสำคัญกว่า `.env` เสมอ |

---

## 🔧 Google Fit Scopes ที่ต้องการ

| Scope | ข้อมูลที่เข้าถึง |
|-------|----------------|
| `fitness.activity.read` | ก้าวเดิน, แคลอรี่ |
| `fitness.sleep.read` | การนอนหลับ |
| `fitness.heart_rate.read` | อัตราการเต้นหัวใจ |
| `fitness.body.read` | น้ำหนัก, BMI |

---

## 📊 ตัวอย่างรายงานที่ส่งใน Discord

```
🌅 รายงานสุขภาพประจำวัน

📅 รายงานสุขภาพ: 2024-07-11

👟 ก้าวเดิน
█████████░ 92%
9,200 / 10,000 ก้าว

😴 การนอนหลับ
7 ชั่วโมง 30 นาที (7.5 ชม.)

❤️ อัตราการเต้นหัวใจ
เฉลี่ย 72 bpm | ต่ำสุด 58 | สูงสุด 95

---

[วิเคราะห์โดย Gemini AI ...]
```
