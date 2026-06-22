# 智能長者個案管理系統 - 社工工作台

## 項目概述

本系統是一個面向香港社區長者服務場景的智能個案管理系統，主要用戶為社工。系統幫助社工完成長者個案管理、AI 資料識別、規則庫風險評估、檔案篩選、重點個案跟進，以及生成面向長者/家屬的「一頁通報告」。

## 專案結構

```
Round 2/
├── frontend/
│   └── index.html          # 前端 SPA 應用（5個完整頁面）
├── server/                 # 後端服務
│   ├── app.js              # Express 服務入口
│   ├── package.json
│   ├── .env.template       # 環境變數模板
│   ├── .env                # 環境變數（需自行創建）
│   ├── db/                 # 數據庫
│   │   ├── init.js         # 初始化腳本
│   │   ├── database.js     # 數據庫操作層
│   │   └── schema.sql      # SQL Schema
│   ├── routes/             # API 路由
│   │   ├── dashboard.js    # 首頁統計
│   │   ├── elder.js        # 長者檔案
│   │   ├── intake.js       # 智能錄入
│   │   ├── report.js       # 一頁通報告
│   │   ├── schedule.js     # 日程管理
│   │   ├── folder.js       # 二級檔案庫
│   │   ├── export.js       # 導出 Excel
│   │   └── rules.js        # 規則庫管理
│   ├── services/           # 業務邏輯層
│   │   ├── ruleLoader.js             # JSON 規則庫加載
│   │   ├── chronicDiseaseEvaluator.js # 慢病判斷引擎
│   │   ├── riskEvaluator.js          # 五維度風險評分引擎
│   │   ├── recommendationService.js  # AI 建議匹配引擎
│   │   ├── resourceMatchingService.js # 地區資源匹配引擎
│   │   ├── llmClient.js              # LLM 客戶端
│   │   ├── ocrService.js             # OCR 文本提取
│   │   ├── fileStorageService.js     # 文件存儲
│   │   └── extractionService.js      # 信息抽取管道
│   ├── rules/              # 6 個 JSON 規則庫（已複製）
│   ├── seed/               # 種子數據
│   │   └── seed.js         # 測試數據生成腳本
│   └── uploads/            # 上傳文件目錄
└── library/                # 原始 JSON 庫（源文件）
```

## 快速開始

### 1. 環境要求

- **Node.js** ≥ 18（已安裝 22.22.2）→ `C:\Users\Nolan\.workbuddy\binaries\node\versions\22.22.2\node.exe`
- **npm**（隨 Node.js 安裝）

### 2. 配置環境變數

```bash
cd server

# 複製環境變數模板
cp .env.template .env

# 編輯 .env 文件，填入真實的 LLM API Key
# LLM_API_KEY=your_real_api_key_here
```

**重要：** 至少需要設定 `LLM_API_KEY`。如果不設定，系統將使用模擬模式進行資訊提取（基本關鍵詞匹配）。

### 3. 初始化數據庫並填充種子數據

```bash
cd server
C:/Users/Nolan/.workbuddy/binaries/node/versions/22.22.2/node.exe db/init.js
C:/Users/Nolan/.workbuddy/binaries/node/versions/22.22.2/node.exe seed/seed.js
```

### 4. 安裝依賴並啟動後端

```bash
cd server
C:/Users/Nolan/.workbuddy/binaries/node/versions/22.22.2/npm.cmd install
C:/Users/Nolan/.workbuddy/binaries/node/versions/22.22.2/node.exe app.js
```

後端將在 `http://localhost:3001` 啟動。

### 5. 打開前端

直接在瀏覽器中打開 `frontend/index.html`，或使用本地伺服器：

```bash
# 使用 Python 快速啟動
python -m http.server 3000 --directory frontend
```

然後訪問 `http://localhost:3000`。

## 系統頁面

| 頁面 | 路徑 | 說明 |
|------|------|------|
| 首頁（Dashboard） | `/` | 統計概覽、緊急介入清單、今日日程 |
| 檔案庫 | `/archive` | 長者列表、篩選、導出、二級檔案庫 |
| 智能錄入工作台 | `/intake` | 文件上傳、OCR/LLM 識別、規則計算 |
| 長者健康詳情頁 | `/elder/:id` | 基本資料、慢病詳情、風險雷達圖、建議 |
| 一頁通報告頁 | `/report/:id` | 家屬友好版報告、PDF 導出 |

## API 端點

### 首頁統計
- `GET /api/dashboard/summary` - 統計數字
- `GET /api/dashboard/emergency-list` - 緊急介入清單

### 長者檔案
- `GET /api/elders` - 列表（支援 query/riskLevel/ageRange/healthTag 篩選）
- `GET /api/elders/search?q=` - 搜索建議
- `GET /api/elders/:id` - 完整詳情
- `PATCH /api/elders/:id` - 更新檔案
- `GET /api/elders/:id/recommendations` - AI 建議
- `GET /api/elders/:id/resources` - 社區資源推薦

### 智能錄入
- `POST /api/intake/upload` - 文件上傳
- `POST /api/intake/analyze` - 開始分析
- `GET /api/intake/status/:jobId` - 處理進度

### 報告
- `GET /api/reports/:elderId` - 一頁通報告
- `POST /api/reports/:elderId/regenerate` - 重新生成

### 日程
- `GET /api/schedules?date=YYYY-MM-DD`
- `POST /api/schedules`
- `PATCH /api/schedules/batch-complete`

### 二級檔案庫
- `GET /api/folders`
- `POST /api/folders`
- `POST /api/folders/:id/add-elders`
- `GET /api/folders/:id/elders`

### 導出
- `POST /api/export/excel`

### 規則庫
- `POST /api/rules/reload`
- `GET /api/rules/status`

## 6 個 JSON 規則庫

以下 6 個文件已放置在 `server/rules/` 目錄中：

1. **chronic_disease_dictionary.json** - 慢病名稱、別名、標準化映射
2. **chronic_disease_rules.json** - 通用慢病判斷規則（A/B/C/D 證據等級）
3. **chronic_disease_rules_by_disease.json** - 按疾病拆分的細粒度規則
4. **risk_scoring_rules.json** - 五維度風險評分規則 + 紅旗規則
5. **ai_recommendation_library.json** - AI 跟進建議庫
6. **regional_resource_database.json** - 香港地區資源數據庫

## 正式使用前

1. 在 `server/.env` 中填入真實的 LLM API Key
2. 確認 6 個 JSON 庫位於 `server/rules/` 目錄
3. 初始化數據庫：`node db/init.js`
4. 啟動後端：`node app.js`
5. 打開前端頁面

## 技術棧

- **前端：** 純 HTML + JavaScript + Tailwind CSS CDN + Chart.js CDN + SheetJS CDN
- **後端：** Node.js + Express
- **數據庫：** SQLite (better-sqlite3)
- **文件處理：** multer（上傳）、pdf-parse（PDF）、tesseract.js（OCR）
- **導出：** xlsx（Excel）、瀏覽器原生 print（PDF）

## 重要設計原則

1. **LLM 不直接決定風險等級** — 風險等級由後端 JSON 規則庫計算
2. **LLM 主要負責事實抽取** — 從文件中提取結構化資訊
3. **API Key 嚴禁在前端** — 所有 LLM 調用均由後端代理
4. **所有數據來自後端 API** — 前端不寫死長者數據
5. **社區資源不得憑空編造** — 必須來自 regional_resource_database.json
6. **系統建議定位為社工跟進建議** — 不是醫療診斷或處方
