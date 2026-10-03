# WheatGuard AI – Project Report Outline

**Title:** WheatGuard AI: An AI-Powered Wheat Disease Detection and Recommendation System  
**Subtitle:** Deep Learning-Based Image Classification with Explainable AI and REST API Deployment

---

## 1. Introduction

Introduce the problem domain (wheat as a globally critical crop), the role of AI in
precision agriculture, and the motivation for building an automated disease detection
system accessible to farmers and researchers.

---

## 2. Problem Statement

- Manual disease identification is slow, subjective, and requires expert knowledge.
- Late detection of wheat diseases causes significant yield and economic losses.
- Farmers in developing regions often lack access to trained plant pathologists.
- A need exists for an accessible, low-cost, AI-assisted preliminary screening tool.

---

## 3. Existing Systems

Review prior work:
- PlantVillage dataset and associated CNN classifiers.
- Mobile applications (Plantix, PlantNet) and their limitations.
- Academic transfer-learning approaches for wheat (ResNet, VGG, InceptionNet).
- Gaps: lack of explainability, no structured API, no disease management guidance.

---

## 4. Proposed System

WheatGuard AI addresses the gaps by providing:
- A trained EfficientNet-B0 model with ImageNet pretrained weights.
- Confidence-aware predictions with low-confidence warnings.
- Grad-CAM visual explanations.
- Structured disease metadata and agronomic recommendations.
- A production-ready FastAPI backend and responsive Next.js frontend.
- Persistent prediction history via Supabase.

---

## 5. Objectives

1. Build an end-to-end wheat disease classification pipeline.
2. Achieve competitive accuracy on a multi-class wheat disease dataset.
3. Provide Grad-CAM explainability for each prediction.
4. Design a RESTful API suitable for mobile or web integration.
5. Deploy the system using Docker for reproducibility.

---

## 6. Literature Review

Cover:
- Convolutional Neural Networks for plant disease detection.
- Transfer learning with EfficientNet (Tan & Le, 2019).
- Grad-CAM (Selvaraju et al., 2017).
- Wheat disease datasets (PlantVillage, WD-ISIC, Kaggle competitions).
- Previous wheat-specific deep learning studies.

---

## 7. Methodology

### 7.1 Data Collection
- Dataset source and structure.
- Number of classes and images per class.
- Data quality validation (corrupt files, imbalance detection).

### 7.2 Data Preprocessing
- Image resizing to 224 × 224 px.
- RGB normalisation (ImageNet mean/std).
- Stratified 70/15/15 train/val/test split with seed=42.

### 7.3 Data Augmentation
- RandomResizedCrop, RandomHorizontalFlip, RandomVerticalFlip.
- RandomRotation, ColorJitter, RandomAffine.
- Augmentation applied only to training split.

---

## 8. Dataset

Provide a table:
| Class | Count | % |
|-------|-------|---|
| Healthy | … | … |
| Leaf Rust | … | … |
| … | … | … |

Include class distribution chart from `artifacts/plots/`.

---

## 9. Data Preprocessing

Describe the preprocessing pipeline implemented in `app/ml/preprocessing.py`.
Show before/after examples from `artifacts/plots/augmentation_examples.png`.

---

## 10. Model Architecture

- Base: EfficientNet-B0 (pretrained on ImageNet).
- Replaced classifier head: `Dropout(0.2) → Linear(1280, num_classes)`.
- Total parameters: ~5.3M (EfficientNet-B0).
- Why EfficientNet: compound scaling, state-of-the-art accuracy/efficiency.

Include architecture diagram if available.

---

## 11. Training

- Optimiser: AdamW (lr=0.0001, weight_decay=0.0001).
- Loss: CrossEntropyLoss (with class weights if imbalanced).
- Scheduler: CosineAnnealingLR.
- Early stopping: patience=5 on validation loss.
- Model checkpointing: every epoch + best model saved.

Include training curves from `artifacts/plots/training_curves.png`.

---

## 12. Evaluation

Report from `artifacts/reports/classification_report.json`:

| Metric | Value |
|--------|-------|
| Test Accuracy | … |
| Macro F1 | … |
| Weighted F1 | … |

Include confusion matrix from `artifacts/plots/confusion_matrix.png`.

---

## 13. Explainable AI

- Grad-CAM implementation in `app/ml/gradcam.py`.
- Target layer: last Conv2d of EfficientNet-B0.
- Show example Grad-CAM overlays for each class.
- Limitations: approximate, not a causal explanation.

---

## 14. System Architecture

```
User → Next.js Frontend (Port 3000)
         → FastAPI Backend (Port 8000)
              → Image Validation & Security
              → Preprocessing (224×224, normalise)
              → EfficientNet-B0 Inference
              → Grad-CAM Generation
              → Disease Info Lookup (JSON)
              → Supabase (PostgreSQL) Persistence
         ← Structured JSON Response
← Rendered Results Page
```

---

## 15. API

Endpoints:
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | System health check |
| POST | /api/v1/predict | Run disease prediction |
| GET | /api/v1/history | Paginated history |
| GET | /api/v1/history/stats | Aggregate statistics |
| GET | /api/v1/history/{id} | Single record |
| DELETE | /api/v1/history/{id} | Delete record |

Swagger UI available at: `http://localhost:8000/docs`

---

## 16. User Interface

Describe the Next.js frontend pages:
- **Home** (`/`): landing page, features, how-it-works.
- **Analyze** (`/predict`): drag-drop upload, analysis controls, results.
- **History** (`/history`): paginated table, stats cards, delete.
- **About** (`/about`): tech stack, disease classes, limitations.

Include screenshots.

---

## 17. Results

Summarise key findings:
- Model performance on test set.
- Inference speed on CPU / GPU.
- Grad-CAM qualitative analysis.

---

## 18. Limitations

- Accuracy depends on dataset quality and diversity.
- Low-confidence predictions require expert verification.
- System does not detect nutrient deficiencies or pests.
- Grad-CAM is an approximation, not a causal explanation.
- No real-time field deployment (requires smartphone app).

---

## 19. Future Work

- Expand to more wheat disease classes.
- Mobile app (React Native or Flutter).
- Ensemble models (EfficientNet-B2 + ConvNeXt).
- Vision Transformer fine-tuning.
- Multilingual UI for farmer accessibility.
- Integration with IoT field sensors.

---

## 20. Conclusion

Summarise the achievements, the value of the system for agricultural AI,
and its readiness as a prototype for further development.

---

## References

- Tan, M., & Le, Q. (2019). EfficientNet: Rethinking Model Scaling for CNNs. ICML.
- Selvaraju, R. R., et al. (2017). Grad-CAM: Visual Explanations from Deep Networks. ICCV.
- Hughes, D., & Salathé, M. (2015). An open access repository of images on plant health.
- FastAPI Documentation: https://fastapi.tiangolo.com
- Supabase Documentation: https://supabase.com/docs
