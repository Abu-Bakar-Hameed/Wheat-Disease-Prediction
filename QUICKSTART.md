# WheatGuard AI - Quick Start Guide

## 🚀 Get Up and Running in 5 Minutes

### Step 1: Start the Backend

```powershell
# Navigate to backend directory
cd back

# Activate virtual environment (if not already activated)
.\.venv\Scripts\activate

# Start the FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
INFO:     Model ready: version=2.4 classes=5 device=cpu
```

**Verify Backend:**
- Open http://localhost:8000/docs (Swagger UI)
- Check http://localhost:8000/health (should return `{"status": "healthy"}`)

---

### Step 2: Start the Frontend

```powershell
# Open a NEW terminal
# Navigate to frontend directory
cd front

# Start Next.js development server
npm run dev
```

**Expected Output:**
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Ready in X.Xs
```

**Verify Frontend:**
- Open http://localhost:3000
- You should see the WheatGuard AI landing page

---

### Step 3: Explore the Platform

#### 🎭 Role Switching
1. Use the **center header buttons** to switch between:
   - **Public / Guest** → Landing page with auth forms
   - **Farmer Panel** → Full diagnostic workspace (default)
   - **Enterprise Admin** → Admin view (framework)

#### 🔬 Test Disease Prediction
1. Click **"Farmer Panel"** in header
2. Navigate to **"Leaf Diagnosis"** in sidebar
3. Upload a wheat leaf image from `back/data/test/`
4. Click **"Analyze Leaf with AI"**
5. View prediction results with confidence score

#### 📸 Camera Capture
1. Go to **"Camera Capture"** page
2. Click **"Start Camera"** (allow browser permissions)
3. Align leaf in the reticle
4. Capture photo
5. Analyze the captured image

#### 🌤️ Weather Risk Analysis
1. Navigate to **"Weather Risks"** page
2. View current conditions (temp, humidity, wind)
3. Check disease-specific risk assessments
4. Review 7-day infection forecast
5. Read agronomic recommendations

#### 💬 AI Assistant
1. Go to **"AI Assistant"** page
2. Ask questions like:
   - "What are the symptoms of Yellow Rust?"
   - "Compare Triazole vs Strobilurin fungicides"
   - "How do I scout for wheat diseases?"
3. View AI responses with confidence scores

#### 📊 Reports & Export
1. Navigate to **"Reports & Exports"** page
2. Select date range and format (CSV or JSON)
3. Click **"Generate Report"**
4. Download the exported data

---

### Step 4: Check Dashboard Features

The **Dashboard** (home page) includes:

✅ **Welcome Banner** with time-based greeting
✅ **4 KPI Cards**: Total analyses, healthy samples, diseased, critical cases
✅ **Recent Predictions Table** with inspect links
✅ **Weather Risk Widget** with live conditions
✅ **Disease Distribution Chart** (bar chart)
✅ **Severity Breakdown** (donut chart)
✅ **Predictions Over Time** (line chart)
✅ **Health Ratio** (pie chart)

---

## 🧪 API Testing (Optional)

### Test New Endpoints with cURL

#### Weather Risk
```bash
curl http://localhost:8000/weather/risk
```

#### AI Assistant
```bash
curl -X POST http://localhost:8000/assistant/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is Yellow Rust?"}
    ]
  }'
```

#### Report Generation
```bash
curl -X POST http://localhost:8000/reports/generate \
  -H "Content-Type: application/json" \
  -d '{
    "date_range": "last-30-days",
    "report_type": "all",
    "format": "json"
  }' \
  --output report.json
```

---

## 🔧 Troubleshooting

### Backend Issues

**Problem**: `ModuleNotFoundError: No module named 'app'`
```powershell
# Solution: Install dependencies
pip install -r requirements.txt
```

**Problem**: Model not loaded warning
```
# This is normal if model weights aren't present
# The API will start in degraded mode (predictions unavailable)
# Place trained model at: back/models/wheatguard_resnet50.pth
```

**Problem**: Database connection error
```powershell
# Check .env file has correct Supabase credentials
# Verify: back/.env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

---

### Frontend Issues

**Problem**: `Error: connect ECONNREFUSED 127.0.0.1:8000`
```
# Solution: Ensure backend is running first
# Check http://localhost:8000/health
```

**Problem**: TypeScript errors
```powershell
# Solution: Rebuild type definitions
npm run build
```

**Problem**: Component not found errors
```powershell
# Solution: Check import paths use @/ alias
# Example: import { Header } from "@/components/layout/Header"
```

---

## 📱 Browser Compatibility

**Recommended Browsers:**
- ✅ Chrome 100+ (best experience)
- ✅ Firefox 100+
- ✅ Edge 100+
- ✅ Safari 15+

**Camera Capture requires:**
- HTTPS (in production) or localhost
- Camera permissions granted
- Modern browser with `navigator.mediaDevices` support

---

## 🎯 Key Features to Test

### Must-Try Features
1. ✅ Upload & analyze a wheat leaf image
2. ✅ Switch between Guest and Farmer roles
3. ✅ Check weather risk analysis page
4. ✅ Ask questions to AI Assistant
5. ✅ Generate and download a CSV report
6. ✅ View dashboard with live weather widget
7. ✅ Browse disease library
8. ✅ Check prediction history
9. ✅ Use camera capture (if camera available)
10. ✅ Customize settings & notifications

---

## 🌐 Default URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| API Docs (ReDoc) | http://localhost:8000/redoc |
| OpenAPI Spec | http://localhost:8000/openapi.json |

---

## 📚 Next Steps

1. **Read Feature Guide**: See `WHEATGUARD_FEATURES.md` for complete feature list
2. **Explore API**: Visit http://localhost:8000/docs for interactive API testing
3. **Customize Theme**: Edit `front/tailwind.config.ts` for brand colors
4. **Add Test Data**: Place images in `back/data/test/` for testing
5. **Configure Database**: Set up Supabase for persistence

---

## 💡 Tips

- **Role Switching**: The center header buttons toggle between views
- **Sidebar Navigation**: 11 menu items for different features
- **Notifications**: Click bell icon (🔔) for telemetry alerts
- **Quick Scan**: Use "Scan Leaf" button in header for fast access
- **Mobile View**: Sidebar collapses automatically on smaller screens
- **Dark Mode**: Coming soon (theme selector in Settings)

---

## 🎉 You're Ready!

The platform is now running with:
- ✅ Enhanced dashboard with weather widget
- ✅ 10 functional pages (Dashboard, Predict, Camera, Weather, Assistant, Reports, Settings, History, Diseases, Analytics)
- ✅ Multi-role UI system (Guest/Farmer/Admin)
- ✅ 3 new backend APIs (Weather, Assistant, Reports)
- ✅ Professional Tailwind theme with 50+ brand colors

**Happy Testing! 🌾🔬**
