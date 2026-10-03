# WheatGuard AI

**AI-Powered Wheat Disease Detection and Recommendation System**

> **Disclaimer:** This system provides AI Predictions only. Always consult a qualified agricultural expert for confirmation before applying any treatment.

---

## Overview

WheatGuard AI is a production-quality agricultural AI prototype that accepts a wheat leaf photograph and returns:

- Disease class prediction with confidence score
- Top-3 ranked candidate diseases
- Grad-CAM visual explanation (why did the model predict this?)
- Evidence-based agronomic guidance and management recommendations
- Full prediction history persisted in Supabase

---

## Architecture

```
User
 └─► Next.js Frontend  (port 3000)
      └─► FastAPI Backend  (port 8000)
           ├─► Image Validation + Preprocessing
           ├─► EfficientNet-B0 Inference
           ├─► Grad-CAM Explainability
           ├─► Disease Info Lookup
           └─► Supabase (PostgreSQL) Persistence
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| ML Model | PyTorch · EfficientNet-B0 · timm |
| Backend | FastAPI · Uvicorn · Pydantic |
| Database | Supabase (PostgreSQL) |
| Frontend | Next.js 16 · Tailwind CSS v4 · TypeScript |
| XAI | Grad-CAM |
| Data Science | scikit-learn · NumPy · Pandas · OpenCV |
| Deployment | Docker · docker-compose |
| Testing | pytest |

---

## Supported Disease Classes

| Class | Severity |
|-------|----------|
| Healthy | None |
| Leaf Rust | High |
| Yellow Rust | High |
| Stem Rust | Critical |
| Powdery Mildew | Moderate |
| Septoria Leaf Blotch | High |
| Fusarium Head Blight | Critical |
| Tan Spot | Moderate |

Classes are automatically discovered from the training dataset directory.

---

## Project Structure

```
wheat/
├── back/                      # FastAPI backend (Python)
│   ├── app/
│   │   ├── api/routes/        # health, prediction, history endpoints
│   │   ├── core/              # config, logging, exceptions, security
│   │   ├── database/          # Supabase client, models, CRUD
│   │   ├── ml/                # model, inference, preprocessing, gradcam
│   │   └── schemas/           # Pydantic request/response schemas
│   ├── scripts/               # prepare_dataset, train, evaluate, predict
│   ├── tests/                 # pytest test suite
│   ├── docs/                  # project report outline
│   ├── supabase/              # schema.sql for Supabase setup
│   ├── models/                # best_model.pth, class_names.json (generated)
│   ├── artifacts/             # plots, reports, gradcam images (generated)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
│
├── front/                     # Next.js frontend (TypeScript)
│   ├── src/
│   │   ├── app/               # pages: /, /predict, /history, /about
│   │   ├── components/        # Navbar, ImageUploader, PredictionResult, etc.
│   │   ├── lib/               # api.ts (axios client), utils.ts
│   │   └── types/             # TypeScript interfaces
│   ├── Dockerfile
│   └── .env.local.example
│
├── docker-compose.yml
└── README.md
```

---

## Installation

### Prerequisites

- Python 3.11+
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/wheatguard-ai.git
cd wheatguard-ai
```

### 2. Backend setup

```bash
cd back

# Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment variables
copy .env.example .env   # Windows
cp .env.example .env     # Linux/macOS
```

Edit `.env` and fill in your Supabase credentials.

### 3. Supabase database setup

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor → New query**
3. Paste the contents of `back/supabase/apply_all.sql` — a single, idempotent bundle of `schema.sql`, `schema_activity.sql`, `schema_notifications.sql` and `schema_chatbot.sql` — and click **Run**

(The individual files in `back/supabase/` can also be run one by one; all are safe to re-run.)

### 4. Frontend setup

```bash
cd front

# Copy environment file
copy .env.local.example .env.local   # Windows
cp .env.local.example .env.local     # Linux/macOS
```

Edit `.env.local` with your API URL and Supabase credentials.

```bash
npm install
```

---

## Environment Variables

### Backend (`back/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) | — |
| `CONFIDENCE_THRESHOLD` | Min confidence before low-confidence warning | `0.60` |
| `DEVICE` | `auto`, `cpu`, or `cuda` | `auto` |
| `MAX_UPLOAD_SIZE_MB` | Max upload file size | `10` |
| `IMAGE_SIZE` | Input image size for model | `224` |

### Frontend (`front/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | FastAPI backend URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |

---

## Dataset Preparation

Structure your dataset as:

```
back/data/raw/
├── Healthy/
│   ├── img001.jpg
│   └── ...
├── Leaf_Rust/
│   └── ...
└── Yellow_Rust/
    └── ...
```

Then run:

```bash
cd back
python scripts/prepare_dataset.py --data-dir data/raw
```

This validates images, generates a dataset report, saves `models/class_names.json`, and creates the train/validation/test splits.

---

## Training

```bash
cd back
python scripts/train.py --epochs 20 --batch-size 32 --lr 0.0001
```

Options:

```
--architecture   efficientnet_b0 (default) | resnet50
--epochs         Training epochs (default: 20)
--batch-size     Batch size (default: 32)
--lr             Learning rate (default: 0.0001)
--patience       Early stopping patience (default: 5)
--use-class-weights  Enable weighted loss for imbalanced data
```

Outputs saved to:
- `models/best_model.pth` — best weights by validation loss
- `models/class_names.json` — discovered class names
- `models/model_metadata.json` — training configuration and metrics
- `artifacts/reports/training_history.json` — per-epoch metrics

---

## Evaluation

```bash
cd back
python scripts/evaluate.py
```

Generates:
- `artifacts/reports/classification_report.json`
- `artifacts/plots/confusion_matrix.png`
- `artifacts/plots/training_curves.png`

---

## Running the API

```bash
cd back
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)  
ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## Running the Frontend

```bash
cd front
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

---

## CLI Prediction

```bash
cd back
python scripts/predict.py --image path/to/wheat_leaf.jpg --top-k 3
```

---

## Running Tests

```bash
cd back
pytest
```

The test suite uses mocked PyTorch models — no real weights needed.

---

## Docker Deployment

```bash
# From the project root (wheat/)
# Set your Supabase credentials as environment variables first:
# Windows PowerShell:
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY="your-anon-key"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

docker compose up --build
```

| Service | URL |
|---------|-----|
| API | http://localhost:8000 |
| Frontend | http://localhost:3000 |
| Swagger | http://localhost:8000/docs |

---

## API Documentation

### POST /api/v1/predict

Upload a wheat leaf image for analysis.

**Request:** `multipart/form-data`
- `file` — image file (JPG/PNG/WebP, max 10 MB)
- `include_gradcam` — `true`/`false` (default: `true`)
- `top_k` — integer 1–10 (default: `3`)

**Response:**
```json
{
  "prediction_id": "3fa85f64-...",
  "prediction": "Leaf_Rust",
  "confidence": 0.9241,
  "confidence_percentage": 92.41,
  "low_confidence": false,
  "top_predictions": [...],
  "disease_info": { "display_name": "...", "symptoms": [...], ... },
  "recommendation": "Apply foliar fungicide at first sign...",
  "gradcam": { "original": "data:image/png;base64,...", ... },
  "gradcam_available": true,
  "inference_time_ms": 43.5,
  "model_version": "1.0.0"
}
```

---

## Model

- **Architecture:** EfficientNet-B0 (pretrained on ImageNet-1k)
- **Input:** 224 × 224 RGB image
- **Output:** Softmax probabilities over N classes
- **Optimiser:** AdamW with CosineAnnealingLR
- **Explainability:** Grad-CAM on the last convolutional layer

> **Note:** Model training has not been completed on a real dataset yet.  
> Run `scripts/prepare_dataset.py` and `scripts/train.py` with your dataset to generate weights.

---

## Explainable AI

WheatGuard AI uses Grad-CAM (Gradient-weighted Class Activation Mapping) to produce visual explanations showing which image regions most influenced the prediction.

The UI displays three views:
- **Original** — the preprocessed input image
- **Heatmap** — the raw Grad-CAM activation map
- **Overlay** — the heatmap blended onto the original image

Grad-CAM is an approximate explanation technique and not a scientific diagnosis.

---

## Limitations

- Model performance depends on training data quality and diversity
- Low-confidence predictions should always be verified by an expert
- The system does not detect nutrient deficiencies, pests, or abiotic stress
- Grad-CAM is approximate — not a causal explanation
- GPU not required, but improves inference speed significantly

---

## Future Improvements

- Expand to additional wheat disease classes
- Mobile application (React Native)
- Ensemble models (EfficientNet-B2 + ConvNeXt)
- Vision Transformer fine-tuning
- MLflow experiment tracking integration
- Multilingual UI

---

## License

MIT License. See `LICENSE` for details.

---

## Disclaimer

WheatGuard AI is a research and educational prototype. All predictions are **AI Predictions only** and must not be used as the sole basis for crop management decisions. Always consult a certified agronomist or agricultural extension officer for confirmed diagnosis and treatment recommendations.
