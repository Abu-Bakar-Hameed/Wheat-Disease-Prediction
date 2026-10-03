# # reports.py
# """
# WheatGuard AI – Reports & Export Routes

# Supported downloads (single-record only):
#     GET /api/v1/reports/pptx/single/{id}   → one-result A4 PPTX
#     GET /api/v1/reports/pdf/single/{id}    → one-result A4 PDF
#     GET /api/v1/reports/image/single/{id}  → one-result PNG picture

# Multi-record deck generation has been removed — this module only ever
# builds a single-page report for one prediction record.
# """

# from __future__ import annotations

# import io
# import math
# import os
# import re
# import shutil
# import subprocess
# import tempfile
# import urllib.request
# from datetime import datetime
# from pathlib import Path
# from typing import Any, Optional
# import fitz
# from fastapi import APIRouter, Depends, HTTPException, Path as ApiPath
# from fastapi.responses import StreamingResponse

# from pptx import Presentation
# from pptx.dml.color import RGBColor
# from pptx.enum.shapes import MSO_SHAPE
# from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
# from pptx.util import Emu, Inches, Pt

# EMU_PER_INCH = 914400

# from app.core.auth import get_current_user_id
# from app.core.logging import get_logger
# from app.database.crud import get_prediction_by_id

# logger = get_logger(__name__)
# router = APIRouter(prefix="/api/v1/reports", tags=["Reports & Export"])

# # -----------------------------------------------------------------------------
# # Brand / layout constants
# # -----------------------------------------------------------------------------
# GREEN_DARK = RGBColor(0x00, 0x36, 0x2A)
# GREEN_MID = RGBColor(0x00, 0x6C, 0x49)
# GREEN_PALE = RGBColor(0xF0, 0xFD, 0xF4)
# WHITE = RGBColor(0xFF, 0xFF, 0xFF)
# RED_DARK = RGBColor(0xBA, 0x1A, 0x1A)
# RED_PALE = RGBColor(0xFF, 0xF5, 0xF4)
# ORANGE = RGBColor(0xEA, 0x8A, 0x00)
# ORANGE_PALE = RGBColor(0xFF, 0xF8, 0xE8)
# YELLOW = RGBColor(0xC7, 0x80, 0x00)
# GREY_TEXT = RGBColor(0x25, 0x2A, 0x28)
# GREY_MID = RGBColor(0x66, 0x6D, 0x69)
# GREY_LIGHT = RGBColor(0xC8, 0xCC, 0xCA)
# GREY_PALE = RGBColor(0xF7, 0xF8, 0xF7)
# SLIDE_BG = RGBColor(0xFF, 0xFF, 0xFF)
# BLUE = RGBColor(0x00, 0x5B, 0x8E)

# A4_W = 8.27
# A4_H = 11.69

# # -----------------------------------------------------------------------------
# # Data helpers
# # -----------------------------------------------------------------------------
# _SEVERITY_FROM_CLASS = {
#     "healthy": "none",
#     "leaf rust": "high",
#     "leaf_rust": "high",
#     "brown rust": "high",
#     "brown_rust": "high",
#     "yellow rust": "high",
#     "yellow_rust": "high",
#     "stem rust": "critical",
#     "stem_rust": "critical",
#     "powdery mildew": "moderate",
#     "powdery_mildew": "moderate",
#     "septoria leaf blotch": "high",
#     "septoria_leaf_blotch": "high",
#     "fusarium head blight": "critical",
#     "fusarium_head_blight": "critical",
#     "tan spot": "moderate",
#     "tan_spot": "moderate",
# }

# _DISEASE_ALIASES = {
#     "stem rust": "Black Rust",
#     "stem_rust": "Black Rust",
#     "leaf rust": "Brown Rust",
#     "leaf_rust": "Brown Rust",
#     "yellow rust": "Yellow Rust",
#     "yellow_rust": "Yellow Rust",
# }


# def _get(obj: Any, name: str, default: Any = None) -> Any:
#     """Read an attribute from a model/object or a key from a dict."""
#     if isinstance(obj, dict):
#         return obj.get(name, default)
#     return getattr(obj, name, default)


# def _normalise_text(value: Any) -> str:
#     if value is None:
#         return ""
#     if isinstance(value, (list, tuple, set)):
#         return "\n".join(f"• {str(v).strip()}" for v in value if str(v).strip())
#     if isinstance(value, dict):
#         return "\n".join(f"• {k}: {v}" for k, v in value.items())
#     return str(value).strip()


# def _clean_disease_name(value: Any) -> str:
#     text = str(value or "Unknown disease").replace("_", " ").strip()
#     return text.title()


# def _derive_severity(disease: str) -> str:
#     key = disease.lower().strip()
#     return _SEVERITY_FROM_CLASS.get(key, "unknown")


# def _severity_colour(severity: str) -> RGBColor:
#     s = str(severity or "").lower()
#     if s == "critical":
#         return RED_DARK
#     if s == "high":
#         return ORANGE
#     if s == "moderate":
#         return YELLOW
#     return GREEN_MID


# def _confidence_colour(confidence: float) -> RGBColor:
#     if confidence >= 80:
#         return GREEN_MID
#     if confidence >= 60:
#         return YELLOW
#     if confidence >= 40:
#         return ORANGE
#     return RED_DARK


# def _confidence_value(rec: Any, ai: dict[str, Any]) -> float:
#     raw = ai.get("confidence_pct", _get(rec, "confidence_pct", 0.0))
#     try:
#         value = float(raw)
#     except (TypeError, ValueError):
#         value = 0.0
#     if 0 <= value <= 1:
#         value *= 100
#     return max(0.0, min(100.0, value))


# def _format_model_version(value: Any) -> str:
#     text = str(value or "—")
#     if len(text) > 18 and "-" in text:
#         head, tail = text.split("-", 1)
#         return f"{head}-\n{tail}"
#     return text


# def _report_content(rec: Any) -> dict[str, Any]:
#     ai = _get(rec, "ai_report", None) or {}
#     if not isinstance(ai, dict):
#         ai = {}
#     disease = _clean_disease_name(
#         ai.get("disease") or _get(rec, "predicted_class", "Unknown disease")
#     )
#     severity = str(
#         _get(rec, "severity", None) or ai.get("severity") or _derive_severity(disease)
#     ).lower()
#     confidence = _confidence_value(rec, ai)
#     problem = _normalise_text(ai.get("problem"))
#     recommendation = _normalise_text(ai.get("recommendation"))
#     solution = _normalise_text(ai.get("solution"))

#     if not problem:
#         problem = (
#             f"The wheat leaf image indicates signs associated with {disease}. "
#             "Review the affected plant area carefully and confirm the condition in the field."
#         )
#     if not recommendation:
#         if confidence < 40:
#             recommendation = (
#                 "⚠ Low confidence prediction. Please upload a clearer wheat-leaf image.\n"
#                 "Contact a qualified agronomist if symptoms persist or spread."
#             )
#         else:
#             recommendation = (
#                 "Inspect nearby plants for similar symptoms and follow your local wheat "
#                 "disease-management guidance."
#             )
#     if not solution:
#         solution = (
#             "Use an appropriate, locally approved management treatment when the disease "
#             "is confirmed. Follow label instructions and agronomic advice."
#         )

#     alias = ai.get("disease_alias") or _DISEASE_ALIASES.get(disease.lower())
#     return {
#         "ai": ai,
#         "disease": disease,
#         "alias": str(alias) if alias else "",
#         "severity": severity,
#         "confidence": confidence,
#         "problem": problem,
#         "recommendation": recommendation,
#         "solution": solution,
#         "model_version": _get(rec, "model_version", None) or ai.get("model_version") or "—",
#         "inference_ms": _get(rec, "inference_time_ms", None) or ai.get("inference_time_ms"),
#         "filename": _get(rec, "filename", None) or ai.get("filename") or "—",
#         "low_confidence": bool(_get(rec, "low_confidence", False)) or confidence < 40,
#         "image_source": (
#             _get(rec, "image_path", None)
#             or _get(rec, "file_path", None)
#             or _get(rec, "image_url", None)
#             or ai.get("image_path")
#             or ai.get("file_path")
#             or ai.get("image_url")
#         ),
#     }


# # -----------------------------------------------------------------------------
# # PowerPoint drawing helpers
# # -----------------------------------------------------------------------------
# def _set_slide_bg(slide, colour: RGBColor = SLIDE_BG) -> None:
#     fill = slide.background.fill
#     fill.solid()
#     fill.fore_color.rgb = colour


# def _add_shape(slide, shape_type, left, top, width, height,
#                fill: Optional[RGBColor] = None, line: Optional[RGBColor] = None,
#                line_width: float = 1.0):
#     shape = slide.shapes.add_shape(
#         shape_type, Inches(left), Inches(top), Inches(width), Inches(height),
#     )
#     if fill is None:
#         shape.fill.background()
#     else:
#         shape.fill.solid()
#         shape.fill.fore_color.rgb = fill
#     if line is None:
#         shape.line.fill.background()
#     else:
#         shape.line.color.rgb = line
#         shape.line.width = Pt(line_width)
#     return shape


# def _add_rect(slide, left, top, width, height, fill, line=None, line_width=1):
#     return _add_shape(slide, MSO_SHAPE.RECTANGLE, left, top, width, height, fill, line, line_width)


# def _add_rounded_rect(slide, left, top, width, height, fill, line=None, line_width=1):
#     return _add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height, fill, line, line_width)


# def _add_text_box(slide, left, top, width, height, text, font_size=12, bold=False,
#                    colour: RGBColor = GREY_TEXT, align: PP_ALIGN = PP_ALIGN.LEFT,
#                    font_name="Aptos", valign: MSO_ANCHOR = MSO_ANCHOR.MIDDLE,
#                    margin=0.02, italic=False):
#     box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
#     tf = box.text_frame
#     tf.clear()
#     tf.word_wrap = True
#     tf.vertical_anchor = valign
#     tf.margin_left = Inches(margin)
#     tf.margin_right = Inches(margin)
#     tf.margin_top = Inches(margin)
#     tf.margin_bottom = Inches(margin)
#     p = tf.paragraphs[0]
#     p.alignment = align
#     run = p.add_run()
#     run.text = str(text or "")
#     run.font.name = font_name
#     run.font.size = Pt(font_size)
#     run.font.bold = bold
#     run.font.italic = italic
#     run.font.color.rgb = colour
#     return box


# def _add_icon_circle(slide, left, top, diameter, symbol, bg, fg=WHITE, size=18):
#     _add_shape(slide, MSO_SHAPE.OVAL, left, top, diameter, diameter, bg, None)
#     _add_text_box(
#         slide, left, top + 0.01, diameter, diameter - 0.01,
#         symbol, font_size=size, bold=True, colour=fg, align=PP_ALIGN.CENTER,
#         font_name="Segoe UI Symbol",
#     )


# def _add_logo(slide, x: float, y: float) -> None:
#     _add_shape(slide, MSO_SHAPE.PENTAGON, x, y, 0.46, 0.56, WHITE, GREEN_DARK, 1.5)
#     _add_shape(slide, MSO_SHAPE.PENTAGON, x + 0.055, y + 0.055, 0.35, 0.44, WHITE, GREEN_DARK, 1.0)
#     _add_rect(slide, x + 0.225, y + 0.11, 0.018, 0.35, RGBColor(0xC7, 0x8A, 0x08), None)
#     for i in range(5):
#         yy = y + 0.11 + i * 0.065
#         _add_shape(slide, MSO_SHAPE.OVAL, x + 0.14, yy, 0.12, 0.045, RGBColor(0xC7, 0x8A, 0x08), None)
#         _add_shape(slide, MSO_SHAPE.OVAL, x + 0.23, yy + 0.025, 0.12, 0.045, RGBColor(0xC7, 0x8A, 0x08), None)


# def _add_leaf_icon(slide, x: float, y: float, size: float, colour: RGBColor):
#     _add_shape(slide, MSO_SHAPE.OVAL, x, y, size, size * 0.55, WHITE, colour, 1.3)
#     _add_rect(slide, x + size * 0.47, y + size * 0.08, size * 0.025, size * 0.42, colour, None)


# def _add_alert_icon(slide, x: float, y: float, size: float, colour: RGBColor = RED_DARK):
#     _add_shape(slide, MSO_SHAPE.ISOSCELES_TRIANGLE, x, y, size, size, colour, None)
#     _add_text_box(
#         slide, x + size * 0.28, y + size * 0.24, size * 0.44, size * 0.50,
#         "!", font_size=size * 28, bold=True, colour=WHITE,
#         align=PP_ALIGN.CENTER, font_name="Aptos Display",
#     )


# def _add_stopwatch_icon(slide, x: float, y: float, size: float):
#     _add_shape(slide, MSO_SHAPE.OVAL, x, y + size * 0.10, size * 0.78, size * 0.78, WHITE, GREEN_DARK, 1.5)
#     _add_rect(slide, x + size * 0.29, y, size * 0.20, size * 0.15, GREEN_DARK, None)
#     _add_rect(slide, x + size * 0.37, y + size * 0.40, size * 0.04, size * 0.22, GREEN_DARK, None)
#     _add_rect(slide, x + size * 0.37, y + size * 0.40, size * 0.20, size * 0.04, GREEN_DARK, None)


# def _add_metric_block(slide, x, y, w, label, value, colour):
#     _add_text_box(slide, x, y, w, 0.22, label.upper(), 7.2, True, GREY_TEXT, PP_ALIGN.CENTER)
#     value_size = 17 if len(str(value)) <= 8 else 12.5
#     _add_text_box(slide, x, y + 0.20, w, 0.44, value, value_size, True, colour, PP_ALIGN.CENTER)


# def _emu(value_inches: float) -> Emu:
#     return Emu(int(round(value_inches * EMU_PER_INCH)))


# def _dome_arc_points(cx, cy, r_outer, r_inner, fraction, steps=28):
#     """Vertices (in inches) of a semicircular donut sector, filled left-to-right."""
#     theta_start = 180.0
#     theta_end = 180.0 - fraction * 180.0
#     pts = []
#     for i in range(steps + 1):
#         t = theta_start + (theta_end - theta_start) * i / steps
#         rad = math.radians(t)
#         pts.append((cx + r_outer * math.cos(rad), cy - r_outer * math.sin(rad)))
#     for i in range(steps + 1):
#         t = theta_end + (theta_start - theta_end) * i / steps
#         rad = math.radians(t)
#         pts.append((cx + r_inner * math.cos(rad), cy - r_inner * math.sin(rad)))
#     return pts


# def _add_dome_sector(slide, x, y, w, h, fraction, colour):
#     """Draw one filled semicircular donut sector (0.0-1.0 of the half-circle) as a freeform shape."""
#     fraction = max(0.0, min(1.0, fraction))
#     if fraction <= 0.003:
#         return None
#     cx, cy = x + w / 2, y + h
#     r_outer = w / 2
#     r_inner = r_outer * 0.65
#     pts = _dome_arc_points(cx, cy, r_outer, r_inner, fraction)
#     start_x, start_y = pts[0]
#     fb = slide.shapes.build_freeform(_emu(start_x), _emu(start_y), scale=1.0)
#     fb.add_line_segments([(_emu(px), _emu(py)) for px, py in pts[1:]], close=True)
#     shape = fb.convert_to_shape()
#     shape.fill.solid()
#     shape.fill.fore_color.rgb = colour
#     shape.line.fill.background()
#     return shape


# def _add_gauge_arc(slide, x, y, w, h, pct, colour, track_colour=GREY_LIGHT):
#     """Draw a semicircular ('dome') progress gauge, filled left-to-right by pct (0-100)."""
#     _add_dome_sector(slide, x, y, w, h, 1.0, track_colour)
#     _add_dome_sector(slide, x, y, w, h, pct / 100.0, colour)


# def _add_wheat_decor(slide, x, y, size, colour):
#     """Large pale wheat-stalk illustration used as a section-card watermark icon."""
#     _add_rect(slide, x + size * 0.47, y + size * 0.06, size * 0.03, size * 0.9, colour, None)
#     for i in range(6):
#         yy = y + size * 0.06 + i * (size * 0.13)
#         _add_shape(slide, MSO_SHAPE.OVAL, x + size * 0.24, yy, size * 0.26, size * 0.11, colour, None)
#         _add_shape(slide, MSO_SHAPE.OVAL, x + size * 0.50, yy + size * 0.05, size * 0.26, size * 0.11, colour, None)


# def _add_clipboard_decor(slide, x, y, size, colour):
#     """Large pale clipboard illustration used as the recommendation card watermark icon."""
#     _add_rounded_rect(slide, x, y + size * 0.08, size, size * 0.92, None, colour, 2.5)
#     _add_rounded_rect(slide, x + size * 0.30, y, size * 0.40, size * 0.16, colour, None)
#     for i in range(3):
#         yy = y + size * 0.32 + i * (size * 0.22)
#         _add_rect(slide, x + size * 0.18, yy, size * 0.64, size * 0.07, colour, None)


# def _add_shield_decor(slide, x, y, size, colour):
#     """Large pale shield-check illustration used as the solution card watermark icon."""
#     _add_shape(slide, MSO_SHAPE.PENTAGON, x, y, size * 0.78, size, None, colour, 2.5)
#     _add_icon_circle(slide, x + size * 0.16, y + size * 0.30, size * 0.46, "✓", colour, WHITE, int(size * 26))


# def _fit_text(text: str, max_chars: int) -> str:
#     text = str(text or "").strip()
#     return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"


# def _add_section_card(slide, y, height, title, body, accent, bg, icon_symbol, decor=None):
#     x = 0.18
#     w = A4_W - 0.36
#     _add_rounded_rect(slide, x, y, w, height, bg, accent, 0.8)
#     decor_size = min(height - 0.30, 0.85) if decor is not None else 0.0
#     if decor is not None:
#         decor(slide, x + w - decor_size - 0.28, y + (height - decor_size) / 2, decor_size, accent)
#     _add_icon_circle(slide, x + 0.18, y + 0.22, 0.34, icon_symbol, accent, WHITE, 14)
#     _add_text_box(slide, x + 0.62, y + 0.18, 2.20, 0.30, title.upper(), 12, True, accent, PP_ALIGN.LEFT)
#     text_width = w - 0.62 - (decor_size + 0.40 if decor is not None else 0.28)
#     _add_text_box(
#         slide, x + 0.62, y + 0.52, text_width, height - 0.66,
#         _fit_text(body, 340), 9.2, False, GREY_TEXT, PP_ALIGN.LEFT,
#         valign=MSO_ANCHOR.TOP, margin=0.01,
#     )


# def _add_image_placeholder(slide, x, y, w, h):
#     _add_rounded_rect(slide, x, y, w, h, RGBColor(0xE9, 0xF2, 0xE8), GREY_LIGHT, 0.8)
#     _add_leaf_icon(slide, x + w * 0.40, y + 0.55, 0.45, GREEN_MID)
#     _add_text_box(slide, x + 0.25, y + 1.15, w - 0.50, 0.40, "WHEAT LEAF IMAGE", 13, True, GREEN_DARK, PP_ALIGN.CENTER)
#     _add_text_box(slide, x + 0.25, y + 1.55, w - 0.50, 0.30, "Image unavailable", 8, False, GREY_MID, PP_ALIGN.CENTER)


# def _resolve_image_source(source: Any) -> Optional[str]:
#     if not source:
#         return None
#     text = str(source).strip()
#     if not text:
#         return None
#     if text.startswith("file://"):
#         text = text[7:]
#     if re.match(r"^https?://", text, re.I):
#         return _download_report_image(text)
#     path = Path(text)
#     if path.exists() and path.is_file():
#         return str(path)
#     return None


# def _download_report_image(url: str) -> Optional[str]:
#     try:
#         suffix = Path(url.split("?", 1)[0]).suffix.lower()
#         if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
#             suffix = ".jpg"
#         fd, path = tempfile.mkstemp(prefix="wheatguard_report_", suffix=suffix)
#         os.close(fd)
#         request = urllib.request.Request(url, headers={"User-Agent": "WheatGuard-AI-Report/1.0"})
#         with urllib.request.urlopen(request, timeout=15) as response, open(path, "wb") as out:
#             out.write(response.read())
#         return path
#     except Exception as exc:
#         logger.warning("Could not download report image URL: %s", exc)
#         return None


# def _add_picture_cover(slide, source, x, y, w, h):
#     path = _resolve_image_source(source)
#     if not path:
#         raise FileNotFoundError(str(source))
#     from PIL import Image
#     with Image.open(path) as im:
#         src_w, src_h = im.size
#     target_ratio = w / h
#     source_ratio = src_w / src_h
#     picture = slide.shapes.add_picture(path, Inches(x), Inches(y), width=Inches(w), height=Inches(h))
#     if source_ratio > target_ratio:
#         crop = 1 - target_ratio / source_ratio
#         picture.crop_left = crop / 2
#         picture.crop_right = crop / 2
#     elif source_ratio < target_ratio:
#         crop = 1 - source_ratio / target_ratio
#         picture.crop_top = crop / 2
#         picture.crop_bottom = crop / 2
#     return picture


# def _add_image_card(slide, x, y, w, h, image_source, filename):
#     _add_rounded_rect(slide, x, y, w, h, WHITE, GREY_LIGHT, 0.8)
#     _add_rect(slide, x, y, w, 0.46, GREEN_DARK, None)
#     _add_leaf_icon(slide, x + 0.18, y + 0.105, 0.18, WHITE)
#     _add_text_box(slide, x + 0.48, y + 0.075, w - 0.62, 0.28, "WHEAT LEAF IMAGE", 10.5, True, WHITE)
#     ix, iy = x + 0.14, y + 0.60
#     iw, ih = w - 0.28, 2.12
#     if image_source:
#         try:
#             _add_picture_cover(slide, image_source, ix, iy, iw, ih)
#         except Exception as exc:
#             logger.warning("Report image could not be inserted: %s", exc)
#             _add_image_placeholder(slide, ix, iy, iw, ih)
#     else:
#         _add_image_placeholder(slide, ix, iy, iw, ih)
#     _add_icon_circle(slide, x + 0.52, y + 2.88, 0.28, "▧", GREEN_MID, WHITE, 11)
#     _add_text_box(slide, x + 0.88, y + 2.83, w - 1.08, 0.25, "Record 1/1", 8.5, True, GREY_TEXT, PP_ALIGN.LEFT)
#     _add_text_box(slide, x + 0.16, y + 3.12, w - 0.32, 0.25, _fit_text(filename, 48), 7.2, False, GREY_MID, PP_ALIGN.CENTER)


# # -----------------------------------------------------------------------------
# # Single diagnostic page
# # -----------------------------------------------------------------------------
# def _build_diagnostic_page(prs: Presentation, rec: Any):
#     data = _report_content(rec)
#     disease = data["disease"]
#     alias = data["alias"]
#     severity = data["severity"]
#     confidence = data["confidence"]
#     sev_colour = _severity_colour(severity)
#     conf_colour = _confidence_colour(confidence)
#     model_version = _format_model_version(data["model_version"])
#     inference = data["inference_ms"]
#     try:
#         inference_text = f"{float(inference):.0f} ms" if inference is not None else "—"
#     except (TypeError, ValueError):
#         inference_text = str(inference or "—")

#     slide = prs.slides.add_slide(prs.slide_layouts[6])
#     _set_slide_bg(slide, WHITE)

#     # Header
#     _add_logo(slide, 0.30, 0.22)
#     _add_text_box(slide, 0.92, 0.22, 4.2, 0.50, "WheatGuard AI", 25, True, GREEN_DARK, font_name="Aptos Display")
#     _add_text_box(slide, 0.94, 0.70, 4.3, 0.27, "Precision Wheat Disease Prediction System", 10.5, False, GREY_TEXT)
#     _add_text_box(slide, 5.30, 0.38, 2.55, 0.42, "FIELD DIAGNOSTIC REPORT", 13.5, True, GREEN_DARK, PP_ALIGN.RIGHT, font_name="Aptos Display")
#     _add_rect(slide, 0.20, 1.12, A4_W - 0.40, 0.035, GREEN_MID, None)
#     _add_shape(slide, MSO_SHAPE.OVAL, A4_W - 0.34, 1.085, 0.10, 0.10, GREEN_MID, None)

#     # Main cards
#     left_x, left_w = 0.20, 3.48
#     right_x, right_w = 3.86, 4.21
#     card_y, card_h = 1.40, 3.76

#     _add_image_card(slide, left_x, card_y, left_w, card_h, data["image_source"], data["filename"])

#     _add_rounded_rect(slide, right_x, card_y, right_w, card_h, WHITE, GREY_LIGHT, 0.9)
#     _add_alert_icon(slide, right_x + 0.56, card_y + 0.20, 0.30, RED_DARK)
#     _add_text_box(slide, right_x + 0.98, card_y + 0.20, right_w - 1.25, 0.34, "DISEASE DETECTED", 12, True, RED_DARK, PP_ALIGN.LEFT, font_name="Aptos Display")
#     _add_text_box(slide, right_x + 0.18, card_y + 0.70, right_w - 0.36, 0.52, disease, 27, True, sev_colour, PP_ALIGN.CENTER, font_name="Aptos Display")
#     if alias:
#         _add_text_box(slide, right_x + 0.18, card_y + 1.18, right_w - 0.36, 0.33, f"({alias})", 15, True, GREY_TEXT, PP_ALIGN.CENTER)
#     _add_rect(slide, right_x + 0.14, card_y + 1.57, right_w - 0.28, 0.018, RED_DARK, None)

#     k_top = card_y + 1.77
#     col_w = (right_w - 0.30) / 3
#     conf_col_x = right_x + 0.05
#     conf_col_w = col_w - 0.10
#     _add_text_box(slide, conf_col_x, k_top, conf_col_w, 0.20, "AI CONFIDENCE", 7.2, True, GREY_TEXT, PP_ALIGN.CENTER)
#     _add_text_box(slide, conf_col_x, k_top + 0.18, conf_col_w, 0.30, f"{confidence:.0f}%", 17, True, conf_colour, PP_ALIGN.CENTER)
#     gauge_w = min(conf_col_w - 0.10, 0.95)
#     _add_gauge_arc(slide, conf_col_x + (conf_col_w - gauge_w) / 2, k_top + 0.52, gauge_w, gauge_w / 2, confidence, conf_colour)
#     _add_metric_block(slide, right_x + col_w + 0.05, k_top, col_w - 0.10, "SEVERITY", severity.capitalize(), sev_colour)
#     model_x = right_x + 2 * col_w + 0.05
#     model_w = col_w - 0.10
#     _add_text_box(slide, model_x, k_top, model_w, 0.22, "MODEL VERSION", 7.2, True, GREY_TEXT, PP_ALIGN.CENTER)
#     _add_text_box(slide, model_x, k_top + 0.22, model_w, 0.58, model_version, 10.2, True, GREEN_DARK, PP_ALIGN.CENTER, valign=MSO_ANCHOR.TOP, margin=0.0)
#     _add_stopwatch_icon(slide, right_x + 1.70, card_y + 2.82, 0.30)
#     _add_text_box(slide, right_x + 2.02, card_y + 2.82, 1.70, 0.25, f"Inference: {inference_text}", 9.5, True, GREY_TEXT, PP_ALIGN.LEFT)

#     if data["low_confidence"]:
#         _add_rounded_rect(slide, right_x + 0.14, card_y + 3.25, right_w - 0.28, 0.43, ORANGE_PALE, ORANGE, 0.8)
#         _add_alert_icon(slide, right_x + 1.38, card_y + 3.32, 0.23, ORANGE)
#         _add_text_box(slide, right_x + 1.70, card_y + 3.30, 2.10, 0.27, "LOW CONFIDENCE", 9.5, True, ORANGE, PP_ALIGN.LEFT)

#     # Information cards
#     _add_section_card(slide, 5.38, 1.32, "Problem", data["problem"], RED_DARK, RED_PALE, "!", decor=_add_wheat_decor)
#     _add_section_card(slide, 6.84, 1.46, "Recommendation", data["recommendation"], ORANGE, ORANGE_PALE, "!", decor=_add_clipboard_decor)
#     _add_section_card(slide, 8.45, 1.30, "Solution", data["solution"], GREEN_MID, GREEN_PALE, "✓", decor=_add_shield_decor)

#     # Bottom KPI strip
#     strip_y, strip_h = 9.92, 0.68
#     _add_rounded_rect(slide, 0.18, strip_y, A4_W - 0.36, strip_h, WHITE, GREY_LIGHT, 0.8)
#     cell_w = (A4_W - 0.36) / 4
#     metrics = [
#         ("CONFIDENCE", f"{confidence:.0f}%", conf_colour),
#         ("SEVERITY", severity.upper(), sev_colour),
#         ("INFERENCE", inference_text, GREEN_DARK),
#         ("STATUS", "AI PREDICTION", BLUE),
#     ]
#     for i, (label, value, colour) in enumerate(metrics):
#         x = 0.18 + i * cell_w
#         if i:
#             _add_rect(slide, x, strip_y + 0.12, 0.012, strip_h - 0.24, GREY_LIGHT, None)
#         _add_metric_block(slide, x + 0.02, strip_y + 0.08, cell_w - 0.04, label, value, colour)

#     # Footer
#     _add_text_box(slide, 0.28, 10.68, A4_W - 0.56, 0.24, f"WheatGuard AI  ·  Field Diagnostic Report  ·  {disease}", 8.4, True, GREEN_DARK, PP_ALIGN.CENTER)
#     _add_rect(slide, 0.20, 10.98, A4_W - 0.40, 0.012, GREY_LIGHT, None)
#     _add_logo(slide, 0.52, 11.00)
#     _add_text_box(slide, 1.15, 11.00, 6.60, 0.24, "AI predictions only. Always consult a qualified agricultural expert before applying treatments.", 7.2, False, GREY_TEXT, PP_ALIGN.LEFT)
#     _add_text_box(slide, 1.15, 11.25, 6.60, 0.18, "Compliant with USDA ARS & ISO-AGRI-402 standards.", 6.8, False, GREY_MID, PP_ALIGN.LEFT)
#     _add_rect(slide, 0.18, 11.46, A4_W - 0.36, 0.23, GREEN_DARK, None)
#     _add_text_box(slide, 0.28, 11.47, A4_W - 0.56, 0.20, "WheatGuard AI © 2025 — Precision Wheat Disease Prediction System", 8.3, False, WHITE, PP_ALIGN.CENTER)
#     return slide


# def _new_a4_presentation() -> Presentation:
#     prs = Presentation()
#     prs.slide_width = Inches(A4_W)
#     prs.slide_height = Inches(A4_H)
#     return prs


# def _build_single_report_pptx(rec: Any) -> bytes:
#     prs = _new_a4_presentation()
#     _build_diagnostic_page(prs, rec)
#     buf = io.BytesIO()
#     prs.save(buf)
#     return buf.getvalue()


# # -----------------------------------------------------------------------------
# # LibreOffice conversion helpers
# # -----------------------------------------------------------------------------
# def _find_libreoffice() -> Optional[str]:
#     candidates = [
#         shutil.which("libreoffice"),
#         shutil.which("soffice"),
#         r"C:\Program Files\LibreOffice\program\soffice.exe",
#         r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
#     ]
#     for candidate in candidates:
#         if candidate and Path(candidate).exists():
#             return candidate
#     return None


# def _convert_pptx_to_pdf(pptx_bytes: bytes) -> bytes:
#     libreoffice = _find_libreoffice()
#     if not libreoffice:
#         raise RuntimeError(
#             "LibreOffice is required for PDF/image export. Install LibreOffice on the server."
#         )
#     with tempfile.TemporaryDirectory() as tmp:
#         tmp_path = Path(tmp)
#         pptx_path = tmp_path / "report.pptx"
#         pptx_path.write_bytes(pptx_bytes)
#         result = subprocess.run(
#             [libreoffice, "--headless", "--convert-to", "pdf", "--outdir", str(tmp_path), str(pptx_path)],
#             capture_output=True, text=True, timeout=120,
#         )
#         pdf_path = tmp_path / "report.pdf"
#         if result.returncode != 0 or not pdf_path.exists():
#             raise RuntimeError(f"PDF conversion failed: {result.stderr or result.stdout}")
#         return pdf_path.read_bytes()


# def _convert_pptx_to_png(pptx_bytes: bytes) -> bytes:
#     """
#     Convert the generated A4 PPTX report into a PNG image.

#     Flow:
#         PPTX -> LibreOffice -> PDF -> PyMuPDF -> PNG

#     PyMuPDF is used instead of pdftoppm so Windows does not require
#     a separate Poppler installation.
#     """

#     libreoffice = _find_libreoffice()

#     if not libreoffice:
#         raise RuntimeError(
#             "LibreOffice is required for image export. "
#             "Install LibreOffice and restart the backend."
#         )

#     try:
#         with tempfile.TemporaryDirectory() as tmp:
#             tmp_path = Path(tmp)

#             # -------------------------------------------------------------
#             # 1. Save PPTX temporarily
#             # -------------------------------------------------------------
#             pptx_path = tmp_path / "report.pptx"
#             pptx_path.write_bytes(pptx_bytes)

#             # -------------------------------------------------------------
#             # 2. Convert PPTX -> PDF using LibreOffice
#             # -------------------------------------------------------------
#             result = subprocess.run(
#                 [
#                     libreoffice,
#                     "--headless",
#                     "--convert-to",
#                     "pdf",
#                     "--outdir",
#                     str(tmp_path),
#                     str(pptx_path),
#                 ],
#                 capture_output=True,
#                 text=True,
#                 timeout=120,
#             )

#             pdf_path = tmp_path / "report.pdf"

#             if result.returncode != 0 or not pdf_path.exists():
#                 raise RuntimeError(
#                     "PDF conversion failed: "
#                     f"{result.stderr or result.stdout}"
#                 )

#             # -------------------------------------------------------------
#             # 3. Open PDF with PyMuPDF
#             # -------------------------------------------------------------
#             pdf_bytes = pdf_path.read_bytes()

#             document = fitz.open(
#                 stream=pdf_bytes,
#                 filetype="pdf",
#             )

#             if document.page_count == 0:
#                 document.close()
#                 raise RuntimeError(
#                     "Generated PDF contains no pages."
#                 )

#             # Only the first page is needed because this is a
#             # single-record A4 report.
#             page = document.load_page(0)

#             # -------------------------------------------------------------
#             # 4. Render page at high resolution
#             # -------------------------------------------------------------
#             zoom = 2.5

#             matrix = fitz.Matrix(
#                 zoom,
#                 zoom,
#             )

#             pixmap = page.get_pixmap(
#                 matrix=matrix,
#                 alpha=False,
#             )

#             # -------------------------------------------------------------
#             # 5. Convert pixmap to PNG bytes
#             # -------------------------------------------------------------
#             png_bytes = pixmap.tobytes(
#                 "png"
#             )

#             document.close()

#             if not png_bytes:
#                 raise RuntimeError(
#                     "PNG rendering returned empty data."
#                 )

#             return png_bytes

#     except Exception as exc:
#         logger.error(
#             "PPTX -> PNG conversion failed: %s",
#             exc,
#             exc_info=True,
#         )
#         raise RuntimeError(
#             f"PNG conversion failed: {exc}"
#         ) from exc

# def _get_single_record_or_404(prediction_id: str, user_id: str):
#     try:
#         record = get_prediction_by_id(prediction_id, user_id=user_id)
#     except Exception as exc:
#         logger.error("Report record lookup failed: %s", exc, exc_info=True)
#         raise HTTPException(status_code=404, detail="Record not found") from exc
#     if record is None:
#         raise HTTPException(status_code=404, detail="Record not found")
#     return record


# # -----------------------------------------------------------------------------
# # API endpoints — single-record only
# # -----------------------------------------------------------------------------
# @router.get(
#     "/pptx/single/{prediction_id}",
#     summary="Generate one WheatGuard AI field diagnostic report as PPTX",
# )
# async def generate_single_pptx(
#     prediction_id: str = ApiPath(..., description="Prediction UUID"),
#     user_id: str = Depends(get_current_user_id),
# ) -> StreamingResponse:
#     record = _get_single_record_or_404(prediction_id, user_id)
#     try:
#         pptx_bytes = _build_single_report_pptx(record)
#     except Exception as exc:
#         logger.error("pptx single: build failed: %s", exc, exc_info=True)
#         raise HTTPException(status_code=500, detail=f"PPTX generation failed: {exc}") from exc
#     ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
#     filename = f"WheatGuard_{prediction_id[:8]}_{ts}.pptx"
#     return StreamingResponse(
#         io.BytesIO(pptx_bytes),
#         media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
#         headers={"Content-Disposition": f'attachment; filename="{filename}"'},
#     )


# @router.get(
#     "/pdf/single/{prediction_id}",
#     summary="Download a single prediction as PDF",
# )
# async def download_single_pdf(
#     prediction_id: str = ApiPath(..., description="Prediction UUID"),
#     user_id: str = Depends(get_current_user_id),
# ) -> StreamingResponse:
#     record = _get_single_record_or_404(prediction_id, user_id)
#     try:
#         pptx_bytes = _build_single_report_pptx(record)
#         pdf_bytes = _convert_pptx_to_pdf(pptx_bytes)
#     except Exception as exc:
#         logger.error("pdf single: export failed: %s", exc, exc_info=True)
#         raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
#     ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
#     fname = f"WheatGuard_{prediction_id[:8]}_{ts}.pdf"
#     return StreamingResponse(
#         io.BytesIO(pdf_bytes),
#         media_type="application/pdf",
#         headers={"Content-Disposition": f'attachment; filename="{fname}"'},
#     )


# @router.get(
#     "/image/single/{prediction_id}",
#     summary="Download a single prediction as PNG image",
# )
# async def download_single_image(
#     prediction_id: str = ApiPath(..., description="Prediction UUID"),
#     user_id: str = Depends(get_current_user_id),
# ) -> StreamingResponse:
#     record = _get_single_record_or_404(prediction_id, user_id)
#     try:
#         pptx_bytes = _build_single_report_pptx(record)
#         png_bytes = _convert_pptx_to_png(pptx_bytes)
#     except Exception as exc:
#         logger.error("image single: export failed: %s", exc, exc_info=True)
#         raise HTTPException(status_code=500, detail=f"Image generation failed: {exc}")
#     ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
#     fname = f"WheatGuard_{prediction_id[:8]}_{ts}.png"
#     return StreamingResponse(
#         io.BytesIO(png_bytes),
#         media_type="image/png",
#         headers={"Content-Disposition": f'attachment; filename="{fname}"'},
#     )




# reports.py
"""
WheatGuard AI – Reports & Export Routes

Supported downloads (single-record only):
    GET /api/v1/reports/pptx/single/{id}   → one-result A4 PPTX
    GET /api/v1/reports/pdf/single/{id}    → one-result A4 PDF
    GET /api/v1/reports/image/single/{id}  → one-result PNG picture

Multi-record deck generation has been removed — this module only ever
builds a single-page report for one prediction record.

Performance notes (see bottom of file for details):
  - LibreOffice's binary path is resolved once at import time instead of
    being re-scanned from disk on every request.
  - PNG export now converts PPTX -> PNG directly through LibreOffice
    instead of going PPTX -> PDF -> PyMuPDF -> PNG. That removes an entire
    subprocess invocation from the hot path.
  - Every LibreOffice call runs against its own isolated user profile
    directory so concurrent requests never fight over a profile lock
    (which otherwise serializes or fails concurrent conversions).
  - Blocking work (subprocess calls, image downloads) is pushed off the
    event loop with `asyncio.to_thread`, and a semaphore caps how many
    LibreOffice processes can run at once so a burst of requests degrades
    gracefully instead of thrashing the machine.
  - Downloaded source images are cached in-memory per URL for the life of
    the process, so requesting pptx/pdf/png for the same record back to
    back only downloads the image once.
"""

from __future__ import annotations

import asyncio
import io
import math
import os
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import pymupdf as fitz  # PyMuPDF — imported via its modern module name; "import fitz" logs a deprecation warning on every startup.
from fastapi import APIRouter, Depends, HTTPException, Path as ApiPath
from fastapi.responses import StreamingResponse

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

EMU_PER_INCH = 914400

from app.core.auth import get_current_user_id
from app.core.logging import get_logger
from app.database.crud import get_prediction_by_id

logger = get_logger(__name__)
router = APIRouter(prefix="/api/v1/reports", tags=["Reports & Export"])

# -----------------------------------------------------------------------------
# Brand / layout constants
# -----------------------------------------------------------------------------
GREEN_DARK = RGBColor(0x00, 0x36, 0x2A)
GREEN_MID = RGBColor(0x00, 0x6C, 0x49)
GREEN_PALE = RGBColor(0xF0, 0xFD, 0xF4)
GREEN_WASH = RGBColor(0xF4, 0xFA, 0xF6)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
RED_DARK = RGBColor(0xBA, 0x1A, 0x1A)
RED_PALE = RGBColor(0xFF, 0xF5, 0xF4)
ORANGE = RGBColor(0xEA, 0x8A, 0x00)
ORANGE_PALE = RGBColor(0xFF, 0xF8, 0xE8)
YELLOW = RGBColor(0xC7, 0x80, 0x00)
YELLOW_PALE = RGBColor(0xFF, 0xFB, 0xE8)
GREY_TEXT = RGBColor(0x25, 0x2A, 0x28)
GREY_MID = RGBColor(0x66, 0x6D, 0x69)
GREY_LIGHT = RGBColor(0xC8, 0xCC, 0xCA)
GREY_PALE = RGBColor(0xF7, 0xF8, 0xF7)
SLIDE_BG = RGBColor(0xFF, 0xFF, 0xFF)
BLUE = RGBColor(0x00, 0x5B, 0x8E)

A4_W = 8.27
A4_H = 11.69

# Default corner radius fraction used for every rounded-rectangle card.
# Smaller than python-pptx's default (0.1667) for a crisper, more modern look.
CARD_RADIUS = 0.055

# -----------------------------------------------------------------------------
# Data helpers
# -----------------------------------------------------------------------------
_SEVERITY_FROM_CLASS = {
    "healthy": "none",
    "leaf rust": "high",
    "leaf_rust": "high",
    "brown rust": "high",
    "brown_rust": "high",
    "yellow rust": "high",
    "yellow_rust": "high",
    "stem rust": "critical",
    "stem_rust": "critical",
    "powdery mildew": "moderate",
    "powdery_mildew": "moderate",
    "septoria leaf blotch": "high",
    "septoria_leaf_blotch": "high",
    "fusarium head blight": "critical",
    "fusarium_head_blight": "critical",
    "tan spot": "moderate",
    "tan_spot": "moderate",
}

_DISEASE_ALIASES = {
    "stem rust": "Black Rust",
    "stem_rust": "Black Rust",
    "leaf rust": "Brown Rust",
    "leaf_rust": "Brown Rust",
    "yellow rust": "Yellow Rust",
    "yellow_rust": "Yellow Rust",
}


def _get(obj: Any, name: str, default: Any = None) -> Any:
    """Read an attribute from a model/object or a key from a dict."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _normalise_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return "\n".join(f"• {str(v).strip()}" for v in value if str(v).strip())
    if isinstance(value, dict):
        return "\n".join(f"• {k}: {v}" for k, v in value.items())
    return str(value).strip()


def _clean_disease_name(value: Any) -> str:
    text = str(value or "Unknown disease").replace("_", " ").strip()
    return text.title()


def _derive_severity(disease: str) -> str:
    key = disease.lower().strip()
    return _SEVERITY_FROM_CLASS.get(key, "unknown")


def _severity_colour(severity: str) -> RGBColor:
    s = str(severity or "").lower()
    if s == "critical":
        return RED_DARK
    if s == "high":
        return ORANGE
    if s == "moderate":
        return YELLOW
    return GREEN_MID


def _confidence_colour(confidence: float) -> RGBColor:
    if confidence >= 80:
        return GREEN_MID
    if confidence >= 60:
        return YELLOW
    if confidence >= 40:
        return ORANGE
    return RED_DARK


def _confidence_label(confidence: float) -> str:
    if confidence >= 80:
        return "High"
    if confidence >= 60:
        return "Medium"
    if confidence >= 40:
        return "Fair"
    return "Low"


def _confidence_pale(colour: RGBColor) -> RGBColor:
    if colour == GREEN_MID:
        return GREEN_PALE
    if colour == YELLOW:
        return YELLOW_PALE
    if colour == ORANGE:
        return ORANGE_PALE
    return RED_PALE


def _severity_pale(severity: str) -> RGBColor:
    s = str(severity or "").lower()
    if s == "critical":
        return RED_PALE
    if s in ("high", "moderate"):
        return ORANGE_PALE if s == "high" else YELLOW_PALE
    return GREEN_PALE


def _confidence_description(confidence: float) -> str:
    if confidence < 40:
        return ("The AI model is less certain about this diagnosis. Please review field "
                "conditions and consult an agronomist.")
    if confidence < 60:
        return "The AI model has moderate certainty. Cross-check with visible field symptoms before acting."
    if confidence < 80:
        return "The AI model is fairly confident in this diagnosis based on the image provided."
    return "The AI model is highly confident in this diagnosis based on the image provided."


def _format_timestamp(value: Any) -> str:
    """Best-effort human timestamp, e.g. 'Sep 19, 2026, 2:30 PM'. Never raises."""
    if not value:
        return ""
    dt = value
    try:
        if isinstance(value, str):
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if hasattr(dt, "strftime"):
            hour = dt.strftime("%I").lstrip("0") or "0"
            return dt.strftime(f"%b %d, %Y, {hour}:%M %p")
    except Exception:
        pass
    return ""


def _confidence_value(rec: Any, ai: dict[str, Any]) -> float:
    raw = ai.get("confidence_pct", _get(rec, "confidence_pct", 0.0))
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = 0.0
    if 0 <= value <= 1:
        value *= 100
    return max(0.0, min(100.0, value))


def _format_model_version(value: Any) -> str:
    text = str(value or "—")
    if len(text) > 18 and "-" in text:
        head, tail = text.split("-", 1)
        return f"{head}-\n{tail}"
    return text


def _report_content(rec: Any) -> dict[str, Any]:
    ai = _get(rec, "ai_report", None) or {}
    if not isinstance(ai, dict):
        ai = {}
    disease = _clean_disease_name(
        ai.get("disease") or _get(rec, "predicted_class", "Unknown disease")
    )
    severity = str(
        _get(rec, "severity", None) or ai.get("severity") or _derive_severity(disease)
    ).lower()
    confidence = _confidence_value(rec, ai)
    problem = _normalise_text(ai.get("problem"))
    recommendation = _normalise_text(ai.get("recommendation"))
    solution = _normalise_text(ai.get("solution"))

    if not problem:
        problem = (
            f"The wheat leaf image indicates signs associated with {disease}. "
            "Review the affected plant area carefully and confirm the condition in the field."
        )
    if not recommendation:
        if confidence < 40:
            recommendation = (
                "⚠ Low confidence prediction. Please upload a clearer wheat-leaf image.\n"
                "Contact a qualified agronomist if symptoms persist or spread."
            )
        else:
            recommendation = (
                "Inspect nearby plants for similar symptoms and follow your local wheat "
                "disease-management guidance."
            )
    if not solution:
        solution = (
            "Use an appropriate, locally approved management treatment when the disease "
            "is confirmed. Follow label instructions and agronomic advice."
        )

    alias = ai.get("disease_alias") or _DISEASE_ALIASES.get(disease.lower())
    return {
        "ai": ai,
        "disease": disease,
        "alias": str(alias) if alias else "",
        "severity": severity,
        "confidence": confidence,
        "problem": problem,
        "recommendation": recommendation,
        "solution": solution,
        "model_version": _get(rec, "model_version", None) or ai.get("model_version") or "—",
        "inference_ms": _get(rec, "inference_time_ms", None) or ai.get("inference_time_ms"),
        "filename": _get(rec, "filename", None) or ai.get("filename") or "—",
        "low_confidence": bool(_get(rec, "low_confidence", False)) or confidence < 40,
        "confidence_label": _confidence_label(confidence),
        "timestamp": _format_timestamp(
            _get(rec, "created_at", None) or _get(rec, "timestamp", None) or ai.get("created_at")
        ),
        "image_source": (
            _get(rec, "image_path", None)
            or _get(rec, "file_path", None)
            or _get(rec, "image_url", None)
            or ai.get("image_path")
            or ai.get("file_path")
            or ai.get("image_url")
        ),
    }


# -----------------------------------------------------------------------------
# PowerPoint drawing helpers
# -----------------------------------------------------------------------------
def _set_slide_bg(slide, colour: RGBColor = SLIDE_BG) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = colour


def _add_shape(slide, shape_type, left, top, width, height,
               fill: Optional[RGBColor] = None, line: Optional[RGBColor] = None,
               line_width: float = 1.0):
    shape = slide.shapes.add_shape(
        shape_type, Inches(left), Inches(top), Inches(width), Inches(height),
    )
    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(line_width)
    return shape


def _add_rect(slide, left, top, width, height, fill, line=None, line_width=1):
    return _add_shape(slide, MSO_SHAPE.RECTANGLE, left, top, width, height, fill, line, line_width)


def _add_rounded_rect(slide, left, top, width, height, fill, line=None, line_width=1,
                       radius: float = CARD_RADIUS, shadow: bool = False):
    shape = _add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height, fill, line, line_width)
    try:
        shape.adjustments[0] = radius
    except Exception:
        pass
    if shadow:
        _add_shadow(shape)
    return shape


def _add_shadow(shape, blur_pt: float = 9, dist_pt: float = 3.2,
                 alpha_pct: float = 22, colour: str = "0B1F17") -> None:
    """Add a soft drop shadow to an autoshape for a bit of depth/polish.

    Best-effort: silently no-ops if the shape's XML doesn't expose spPr
    (never raises, so a report will always render even if this fails).
    """
    try:
        spPr = shape._element.spPr
        for el in list(spPr.findall(qn("a:effectLst"))):
            spPr.remove(el)
        effect_lst = spPr.makeelement(qn("a:effectLst"), {})
        outer_shdw = effect_lst.makeelement(qn("a:outerShdw"), {
            "blurRad": str(int(Pt(blur_pt))),
            "dist": str(int(Pt(dist_pt))),
            "dir": "5400000",
            "rotWithShape": "0",
        })
        clr = outer_shdw.makeelement(qn("a:srgbClr"), {"val": colour})
        alpha_el = clr.makeelement(qn("a:alpha"), {"val": str(int(alpha_pct * 1000))})
        clr.append(alpha_el)
        outer_shdw.append(clr)
        effect_lst.append(outer_shdw)
        spPr.append(effect_lst)
    except Exception:
        pass


def _add_text_box(slide, left, top, width, height, text, font_size=12, bold=False,
                   colour: RGBColor = GREY_TEXT, align: PP_ALIGN = PP_ALIGN.LEFT,
                   font_name="Aptos", valign: MSO_ANCHOR = MSO_ANCHOR.MIDDLE,
                   margin=0.02, italic=False):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.vertical_anchor = valign
    tf.margin_left = Inches(margin)
    tf.margin_right = Inches(margin)
    tf.margin_top = Inches(margin)
    tf.margin_bottom = Inches(margin)
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = str(text or "")
    run.font.name = font_name
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = colour
    return box


def _add_logo(slide, x: float, y: float) -> None:
    _add_shape(slide, MSO_SHAPE.PENTAGON, x, y, 0.46, 0.56, WHITE, GREEN_DARK, 1.5)
    _add_shape(slide, MSO_SHAPE.PENTAGON, x + 0.055, y + 0.055, 0.35, 0.44, WHITE, GREEN_DARK, 1.0)
    _add_rect(slide, x + 0.225, y + 0.11, 0.018, 0.35, RGBColor(0xC7, 0x8A, 0x08), None)
    for i in range(5):
        yy = y + 0.11 + i * 0.065
        _add_shape(slide, MSO_SHAPE.OVAL, x + 0.14, yy, 0.12, 0.045, RGBColor(0xC7, 0x8A, 0x08), None)
        _add_shape(slide, MSO_SHAPE.OVAL, x + 0.23, yy + 0.025, 0.12, 0.045, RGBColor(0xC7, 0x8A, 0x08), None)


def _add_leaf_icon(slide, x: float, y: float, size: float, colour: RGBColor):
    _add_shape(slide, MSO_SHAPE.OVAL, x, y, size, size * 0.55, WHITE, colour, 1.3)
    _add_rect(slide, x + size * 0.47, y + size * 0.08, size * 0.025, size * 0.42, colour, None)


def _add_metric_block(slide, x, y, w, label, value, colour):
    _add_text_box(slide, x, y, w, 0.22, label.upper(), 7.2, True, GREY_TEXT, PP_ALIGN.CENTER)
    value_size = 17 if len(str(value)) <= 8 else 12.5
    _add_text_box(slide, x, y + 0.20, w, 0.44, value, value_size, True, colour, PP_ALIGN.CENTER)


def _emu(value_inches: float) -> Emu:
    return Emu(int(round(value_inches * EMU_PER_INCH)))


def _donut_sector_points(cx, cy, r_outer, r_inner, theta_start, theta_end, steps=48):
    """Vertices (in inches) of a donut sector spanning theta_start -> theta_end degrees
    (measured counter-clockwise, screen y-down), outer edge then inner edge back."""
    pts = []
    for i in range(steps + 1):
        t = theta_start + (theta_end - theta_start) * i / steps
        rad = math.radians(t)
        pts.append((cx + r_outer * math.cos(rad), cy - r_outer * math.sin(rad)))
    for i in range(steps + 1):
        t = theta_end + (theta_start - theta_end) * i / steps
        rad = math.radians(t)
        pts.append((cx + r_inner * math.cos(rad), cy - r_inner * math.sin(rad)))
    return pts


def _add_ring_gauge(slide, x, y, d, pct, colour, track_colour=GREY_LIGHT, thickness=0.16):
    """Draw a full-circle donut progress ring (like a modern dashboard gauge), filled
    clockwise from the top by pct (0-100). Used for the confidence indicator so it
    reads as a single glanceable ring, matching a clean dashboard-card look."""
    r_outer = d / 2
    r_inner = r_outer * (1 - thickness)
    cx, cy = x + d / 2, y + d / 2
    # Track ring: solid outer circle + a white circle cut out of the middle.
    _add_shape(slide, MSO_SHAPE.OVAL, cx - r_outer, cy - r_outer, 2 * r_outer, 2 * r_outer, track_colour, None)
    _add_shape(slide, MSO_SHAPE.OVAL, cx - r_inner, cy - r_inner, 2 * r_inner, 2 * r_inner, WHITE, None)
    # Progress sector, drawn on top, starting at 12 o'clock and sweeping clockwise.
    frac = max(0.0, min(1.0, pct / 100.0))
    if frac <= 0.003:
        return
    theta_start, theta_end = 90.0, 90.0 - frac * 360.0
    steps = max(6, int(48 * frac))
    pts = _donut_sector_points(cx, cy, r_outer, r_inner, theta_start, theta_end, steps=steps)
    start_x, start_y = pts[0]
    fb = slide.shapes.build_freeform(_emu(start_x), _emu(start_y), scale=1.0)
    fb.add_line_segments([(_emu(px), _emu(py)) for px, py in pts[1:]], close=True)
    shape = fb.convert_to_shape()
    shape.fill.solid()
    shape.fill.fore_color.rgb = colour
    shape.line.fill.background()


def _add_pill(slide, x, y, w, h, text, bg, fg, font_size=8.5, bold=True, icon=None):
    """Small rounded 'badge' — e.g. a severity or confidence-level chip."""
    _add_rounded_rect(slide, x, y, w, h, bg, None, radius=0.5)
    label = f"{icon}  {text}" if icon else text
    _add_text_box(slide, x, y, w, h, label, font_size, bold, fg, PP_ALIGN.CENTER)


def _add_progress_bar(slide, x, y, w, h, pct, colour, track_colour=GREY_LIGHT):
    """Thin horizontal pill-shaped progress bar."""
    _add_rounded_rect(slide, x, y, w, h, track_colour, None, radius=0.5)
    frac = max(0.0, min(1.0, pct / 100.0))
    if frac > 0.01:
        fill_w = max(h, w * frac)
        _add_rounded_rect(slide, x, y, fill_w, h, colour, None, radius=0.5)


def _fit_text(text: str, max_chars: int) -> str:
    text = str(text or "").strip()
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"


def _add_section_card(slide, y, height, title, body, accent, bg, icon_symbol):
    """Clean, flat info card: white background, a soft pale-tinted icon badge,
    a bold near-black title, and gray body copy — no heavy fills or watermark
    illustrations, so all three cards read as one consistent family."""
    x = 0.18
    w = A4_W - 0.36
    _add_rounded_rect(slide, x, y, w, height, WHITE, GREY_LIGHT, 0.8, shadow=True)
    _add_shape(slide, MSO_SHAPE.OVAL, x + 0.20, y + 0.20, 0.36, 0.36, bg, None)
    _add_text_box(
        slide, x + 0.20, y + 0.21, 0.36, 0.35, icon_symbol, 13, True, accent,
        PP_ALIGN.CENTER, font_name="Segoe UI Symbol",
    )
    _add_text_box(slide, x + 0.68, y + 0.19, w - 0.90, 0.34, title, 12.5, True, GREY_TEXT, PP_ALIGN.LEFT, font_name="Aptos Display")
    _add_text_box(
        slide, x + 0.68, y + 0.56, w - 0.90, height - 0.72,
        _fit_text(body, 340), 9.2, False, GREY_MID, PP_ALIGN.LEFT,
        valign=MSO_ANCHOR.TOP, margin=0.01,
    )


def _add_image_placeholder(slide, x, y, w, h):
    _add_rounded_rect(slide, x, y, w, h, RGBColor(0xE9, 0xF2, 0xE8), GREY_LIGHT, 0.8)
    _add_leaf_icon(slide, x + w * 0.40, y + 0.55, 0.45, GREEN_MID)
    _add_text_box(slide, x + 0.25, y + 1.15, w - 0.50, 0.40, "WHEAT LEAF IMAGE", 13, True, GREEN_DARK, PP_ALIGN.CENTER)
    _add_text_box(slide, x + 0.25, y + 1.55, w - 0.50, 0.30, "Image unavailable", 8, False, GREY_MID, PP_ALIGN.CENTER)


def _resolve_image_source(source: Any) -> Optional[str]:
    if not source:
        return None
    text = str(source).strip()
    if not text:
        return None
    if text.startswith("file://"):
        text = text[7:]
    if re.match(r"^https?://", text, re.I):
        return _download_report_image(text)
    path = Path(text)
    if path.exists() and path.is_file():
        return str(path)
    return None


# In-process cache of downloaded source images, keyed by URL, so requesting
# pptx/pdf/png for the same record back-to-back only fetches the image once.
_IMAGE_CACHE: dict[str, str] = {}
_IMAGE_CACHE_LOCK = threading.Lock()
_IMAGE_CACHE_MAX = 128


def _download_report_image(url: str) -> Optional[str]:
    with _IMAGE_CACHE_LOCK:
        cached = _IMAGE_CACHE.get(url)
    if cached and Path(cached).exists():
        return cached
    try:
        suffix = Path(url.split("?", 1)[0]).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
            suffix = ".jpg"
        fd, path = tempfile.mkstemp(prefix="wheatguard_report_", suffix=suffix)
        os.close(fd)
        request = urllib.request.Request(url, headers={"User-Agent": "WheatGuard-AI-Report/1.0"})
        with urllib.request.urlopen(request, timeout=10) as response, open(path, "wb") as out:
            shutil.copyfileobj(response, out)
        with _IMAGE_CACHE_LOCK:
            if len(_IMAGE_CACHE) >= _IMAGE_CACHE_MAX:
                _IMAGE_CACHE.pop(next(iter(_IMAGE_CACHE)), None)
            _IMAGE_CACHE[url] = path
        return path
    except Exception as exc:
        logger.warning("Could not download report image URL: %s", exc)
        return None


def _add_picture_cover(slide, source, x, y, w, h):
    path = _resolve_image_source(source)
    if not path:
        raise FileNotFoundError(str(source))
    from PIL import Image
    with Image.open(path) as im:
        src_w, src_h = im.size
    target_ratio = w / h
    source_ratio = src_w / src_h
    picture = slide.shapes.add_picture(path, Inches(x), Inches(y), width=Inches(w), height=Inches(h))
    if source_ratio > target_ratio:
        crop = 1 - target_ratio / source_ratio
        picture.crop_left = crop / 2
        picture.crop_right = crop / 2
    elif source_ratio < target_ratio:
        crop = 1 - source_ratio / target_ratio
        picture.crop_top = crop / 2
        picture.crop_bottom = crop / 2
    return picture


def _add_image_card(slide, x, y, w, h, image_source, filename):
    """Flat white card: the leaf photo fills nearly the whole card with a
    thin rounded frame, and a small caption row below it — the same quiet
    'photo + one-line caption' pattern used by the reference UI, rather
    than a heavy colour-block header."""
    _add_rounded_rect(slide, x, y, w, h, WHITE, GREY_LIGHT, 0.8, shadow=True)
    ix, iy = x + 0.16, y + 0.16
    iw = w - 0.32
    ih = h - 1.02
    if image_source:
        try:
            picture = _add_picture_cover(slide, image_source, ix, iy, iw, ih)
            picture.line.color.rgb = GREY_LIGHT
            picture.line.width = Pt(0.8)
        except Exception as exc:
            logger.warning("Report image could not be inserted: %s", exc)
            _add_image_placeholder(slide, ix, iy, iw, ih)
    else:
        _add_image_placeholder(slide, ix, iy, iw, ih)

    caption_y = iy + ih + 0.16
    _add_shape(slide, MSO_SHAPE.OVAL, x + 0.16, caption_y + 0.03, 0.22, 0.22, GREY_PALE, GREY_LIGHT, 0.75)
    _add_text_box(slide, x + 0.16, caption_y + 0.02, 0.22, 0.22, "▧", 8.5, False, GREY_MID, PP_ALIGN.CENTER, font_name="Segoe UI Symbol")
    _add_text_box(slide, x + 0.46, caption_y - 0.01, w - 0.62, 0.20, "ORIGINAL FILE", 7.2, True, GREY_MID, PP_ALIGN.LEFT)
    _add_text_box(slide, x + 0.46, caption_y + 0.16, w - 0.62, 0.24, _fit_text(filename, 40), 8.6, True, GREY_TEXT, PP_ALIGN.LEFT)


# -----------------------------------------------------------------------------
# Single diagnostic page
# -----------------------------------------------------------------------------
def _build_diagnostic_page(prs: Presentation, rec: Any):
    data = _report_content(rec)
    disease = data["disease"]
    alias = data["alias"]
    severity = data["severity"]
    confidence = data["confidence"]
    sev_colour = _severity_colour(severity)
    conf_colour = _confidence_colour(confidence)
    inference = data["inference_ms"]
    try:
        inference_text = f"{float(inference):.0f} ms" if inference is not None else "—"
    except (TypeError, ValueError):
        inference_text = str(inference or "—")

    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, WHITE)

    # Header — soft green wash band behind the branding for a bit more polish
    _add_rect(slide, 0, 0, A4_W, 1.12, GREEN_WASH, None)
    _add_logo(slide, 0.30, 0.22)
    _add_text_box(slide, 0.92, 0.22, 4.2, 0.50, "WheatGuard AI", 25, True, GREEN_DARK, font_name="Aptos Display")
    _add_text_box(slide, 0.94, 0.70, 4.3, 0.27, "Precision Wheat Disease Prediction System", 10.5, False, GREY_TEXT)
    _add_text_box(slide, 4.95, 0.40, 3.12, 0.30, "FIELD DIAGNOSTIC REPORT", 13, True, GREEN_DARK, PP_ALIGN.RIGHT, font_name="Aptos Display")
    if data.get("timestamp"):
        _add_text_box(slide, 4.95, 0.72, 3.12, 0.24, data["timestamp"], 9, False, GREY_MID, PP_ALIGN.RIGHT)
    _add_rect(slide, 0.20, 1.12, A4_W - 0.40, 0.035, GREEN_MID, None)
    _add_shape(slide, MSO_SHAPE.OVAL, A4_W - 0.34, 1.085, 0.10, 0.10, GREEN_MID, None)

    # Main cards
    left_x, left_w = 0.20, 3.48
    right_x, right_w = 3.86, 4.21
    card_y, card_h = 1.40, 3.76

    _add_image_card(slide, left_x, card_y, left_w, card_h, data["image_source"], data["filename"])

    # ---- Right card: prediction summary -----------------------------------
    pad = 0.18
    _add_rounded_rect(slide, right_x, card_y, right_w, card_h, WHITE, GREY_LIGHT, 0.9, shadow=True)

    # Row 1 — "AI PREDICTION" chip (left) / "SEVERITY" label + chip (right)
    _add_pill(slide, right_x + pad, card_y + 0.16, 1.35, 0.26, "AI PREDICTION", GREEN_PALE, GREEN_MID, 7.5)
    sev_pill_w = 1.30
    sev_x = right_x + right_w - pad - sev_pill_w
    _add_text_box(slide, sev_x, card_y + 0.02, sev_pill_w, 0.18, "SEVERITY", 7, True, GREY_MID, PP_ALIGN.RIGHT)
    sev_icon = "✓" if severity.lower() in ("none", "healthy") else "⚠"
    _add_pill(slide, sev_x, card_y + 0.20, sev_pill_w, 0.26, severity.capitalize(), _severity_pale(severity), sev_colour, 8.5, icon=sev_icon)

    # Row 2 — disease name (bold, near-black, left aligned) + optional alias
    name_y = card_y + 0.50
    _add_text_box(slide, right_x + pad, name_y, right_w - 2 * pad, 0.44, disease, 24, True, GREY_TEXT, PP_ALIGN.LEFT, font_name="Aptos Display")
    if alias:
        _add_text_box(slide, right_x + pad, name_y + 0.40, right_w - 2 * pad, 0.24, alias, 11, False, GREY_MID, PP_ALIGN.LEFT)
        divider_y = name_y + 0.68
    else:
        divider_y = name_y + 0.48
    _add_rect(slide, right_x + pad, divider_y, right_w - 2 * pad, 0.012, GREY_LIGHT, None)

    # Row 3 — confidence ring gauge + confidence chip / bar / description
    conf_y = divider_y + 0.15
    gauge_d = 1.00
    _add_ring_gauge(slide, right_x + pad, conf_y, gauge_d, confidence, conf_colour)
    _add_text_box(slide, right_x + pad, conf_y + gauge_d * 0.28, gauge_d, 0.28, f"{confidence:.1f}%", 13.5, True, GREY_TEXT, PP_ALIGN.CENTER)
    _add_text_box(slide, right_x + pad, conf_y + gauge_d * 0.58, gauge_d, 0.18, "Confidence", 6.8, False, GREY_MID, PP_ALIGN.CENTER)

    info_x = right_x + pad + gauge_d + 0.20
    info_w = right_w - 2 * pad - gauge_d - 0.20
    _add_text_box(slide, info_x, conf_y, info_w - 1.05, 0.24, "AI Confidence", 10.5, True, GREY_TEXT, PP_ALIGN.LEFT, font_name="Aptos Display")
    _add_pill(slide, info_x + info_w - 0.95, conf_y, 0.95, 0.23, data["confidence_label"], _confidence_pale(conf_colour), conf_colour, 8)
    _add_progress_bar(slide, info_x, conf_y + 0.32, info_w, 0.08, confidence, conf_colour)
    _add_text_box(
        slide, info_x, conf_y + 0.46, info_w, gauge_d - 0.46,
        _fit_text(_confidence_description(confidence), 165), 8.1, False, GREY_MID, PP_ALIGN.LEFT,
        valign=MSO_ANCHOR.TOP, margin=0.0,
    )

    # Row 4 — compact meta footer: model version / inference time (kept to a
    # single line each so it can never collide with the banner below it)
    meta_y = conf_y + gauge_d + 0.14
    _add_rect(slide, right_x + pad, meta_y, right_w - 2 * pad, 0.012, GREY_LIGHT, None)
    meta_y += 0.12
    meta_col_w = (right_w - 2 * pad) / 2
    _add_text_box(slide, right_x + pad, meta_y, meta_col_w, 0.16, "MODEL VERSION", 6.8, True, GREY_MID, PP_ALIGN.LEFT)
    _add_text_box(slide, right_x + pad, meta_y + 0.17, meta_col_w - 0.06, 0.22, _fit_text(str(data["model_version"]), 20), 9, True, GREEN_DARK, PP_ALIGN.LEFT)
    _add_text_box(slide, right_x + pad + meta_col_w, meta_y, meta_col_w, 0.16, "INFERENCE TIME", 6.8, True, GREY_MID, PP_ALIGN.LEFT)
    _add_text_box(slide, right_x + pad + meta_col_w, meta_y + 0.17, meta_col_w, 0.22, inference_text, 9, True, GREEN_DARK, PP_ALIGN.LEFT)

    if data["low_confidence"]:
        banner_y = min(meta_y + 0.46, card_y + card_h - 0.46)
        _add_rounded_rect(slide, right_x + pad, banner_y, right_w - 2 * pad, 0.30, ORANGE_PALE, None, radius=0.35)
        _add_text_box(slide, right_x + pad + 0.14, banner_y, right_w - 2 * pad - 0.28, 0.30, "⚠  Low confidence — please review manually", 8.1, True, ORANGE, PP_ALIGN.LEFT)

    # Information cards — one consistent flat-card family (icon badge, bold
    # title, gray body) so Problem / Recommendation / Solution read as a set.
    _add_section_card(slide, 5.38, 1.32, "Problem", data["problem"], RED_DARK, RED_PALE, "✕")
    _add_section_card(slide, 6.84, 1.46, "Recommendation", data["recommendation"], ORANGE, ORANGE_PALE, "💡")
    _add_section_card(slide, 8.45, 1.30, "Solution", data["solution"], GREEN_MID, GREEN_PALE, "✓")

    # Bottom KPI strip
    strip_y, strip_h = 9.92, 0.68
    _add_rounded_rect(slide, 0.18, strip_y, A4_W - 0.36, strip_h, WHITE, GREY_LIGHT, 0.8, shadow=True)
    cell_w = (A4_W - 0.36) / 4
    metrics = [
        ("CONFIDENCE", f"{confidence:.0f}%", conf_colour),
        ("SEVERITY", severity.upper(), sev_colour),
        ("INFERENCE", inference_text, GREEN_DARK),
        ("STATUS", "AI PREDICTION", BLUE),
    ]
    for i, (label, value, colour) in enumerate(metrics):
        x = 0.18 + i * cell_w
        if i:
            _add_rect(slide, x, strip_y + 0.12, 0.012, strip_h - 0.24, GREY_LIGHT, None)
        _add_metric_block(slide, x + 0.02, strip_y + 0.08, cell_w - 0.04, label, value, colour)

    # Footer
    _add_text_box(slide, 0.28, 10.68, A4_W - 0.56, 0.24, f"WheatGuard AI  ·  Field Diagnostic Report  ·  {disease}", 8.4, True, GREEN_DARK, PP_ALIGN.CENTER)
    _add_rect(slide, 0.20, 10.98, A4_W - 0.40, 0.012, GREY_LIGHT, None)
    _add_logo(slide, 0.52, 11.00)
    _add_text_box(slide, 1.15, 11.00, 6.60, 0.24, "AI predictions only. Always consult a qualified agricultural expert before applying treatments.", 7.2, False, GREY_TEXT, PP_ALIGN.LEFT)
    _add_text_box(slide, 1.15, 11.25, 6.60, 0.18, "Compliant with USDA ARS & ISO-AGRI-402 standards.", 6.8, False, GREY_MID, PP_ALIGN.LEFT)
    _add_rect(slide, 0.18, 11.46, A4_W - 0.36, 0.23, GREEN_DARK, None)
    _add_text_box(slide, 0.28, 11.47, A4_W - 0.56, 0.20, "WheatGuard AI © 2025 — Precision Wheat Disease Prediction System", 8.3, False, WHITE, PP_ALIGN.CENTER)
    return slide


def _new_a4_presentation() -> Presentation:
    prs = Presentation()
    prs.slide_width = Inches(A4_W)
    prs.slide_height = Inches(A4_H)
    return prs


def _build_single_report_pptx(rec: Any) -> bytes:
    prs = _new_a4_presentation()
    _build_diagnostic_page(prs, rec)
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# -----------------------------------------------------------------------------
# LibreOffice conversion helpers
# -----------------------------------------------------------------------------
def _find_libreoffice() -> Optional[str]:
    candidates = [
        shutil.which("libreoffice"),
        shutil.which("soffice"),
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


# Resolved once at import time instead of re-scanning the filesystem on
# every single request — `shutil.which` + a handful of `Path.exists()`
# calls add up when the endpoint is hit repeatedly.
_LIBREOFFICE_PATH: Optional[str] = _find_libreoffice()
_LIBREOFFICE_LOCK = threading.Lock()


def _get_libreoffice_path() -> Optional[str]:
    """Return the cached LibreOffice path, re-resolving once if it was
    missing at startup (e.g. installed after the server started)."""
    global _LIBREOFFICE_PATH
    if _LIBREOFFICE_PATH and Path(_LIBREOFFICE_PATH).exists():
        return _LIBREOFFICE_PATH
    with _LIBREOFFICE_LOCK:
        if not _LIBREOFFICE_PATH or not Path(_LIBREOFFICE_PATH).exists():
            _LIBREOFFICE_PATH = _find_libreoffice()
    return _LIBREOFFICE_PATH


# Caps how many LibreOffice conversions run at once. Each headless soffice
# process is fairly heavy (its own profile + startup cost); letting an
# unbounded number run concurrently just makes every single one slower.
# Tune with the LIBREOFFICE_MAX_CONCURRENCY env var.
_LO_SEMAPHORE = asyncio.Semaphore(max(1, int(os.getenv("LIBREOFFICE_MAX_CONCURRENCY", "3"))))

_PNG_EXPORT_DPI = 220  # ~ matches the previous zoom=2.5 render quality


def _kill_soffice_tree(proc: subprocess.Popen) -> None:
    """Kill a timed-out LibreOffice run *and every process it spawned*.

    `subprocess.run(timeout=...)` only kills its direct child, which on
    Windows is `soffice.exe` — a launcher stub. The real work happens in
    its `soffice.bin` child, which survives the parent's death and keeps
    loading the document. Retrying then competes against the orphan, so a
    90-second budget can quietly cost several minutes and one slow export
    can make the next few slow as well.
    """
    if proc.poll() is not None:
        return  # already exited — and its PID could have been reused
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                capture_output=True,
                timeout=20,
            )
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception as exc:
        logger.warning("Could not tear down LibreOffice process tree (pid=%s): %s", proc.pid, exc)
        try:
            proc.kill()
        except Exception:
            pass


def _run_soffice_convert(pptx_bytes: bytes, convert_to: str, timeout: int = 90) -> bytes:
    """Run a single `soffice --convert-to` pass against an isolated,
    request-scoped user profile (so concurrent conversions never collide
    on LibreOffice's profile lock) and return the produced file's bytes.
    """
    libreoffice = _get_libreoffice_path()
    if not libreoffice:
        raise RuntimeError(
            "LibreOffice is required for PDF/image export. Install LibreOffice on the server."
        )
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        profile_dir = tmp_path / "loprofile"
        # Pre-create the profile dir ourselves rather than relying on LO to
        # do it — belt-and-braces so a fresh temp dir never trips it up.
        profile_dir.mkdir(parents=True, exist_ok=True)
        pptx_path = tmp_path / "report.pptx"
        pptx_path.write_bytes(pptx_bytes)
        # IMPORTANT: build this as a proper file:// URI with Path.as_uri(),
        # not f"file://{path.as_posix()}". On Windows the latter produces
        # "file://C:/Users/..." (missing the 3rd slash before the drive
        # letter), which LibreOffice silently rejects — soffice then either
        # exits immediately with empty stderr/stdout, or hangs until the
        # subprocess timeout fires. as_uri() emits the correct
        # "file:///C:/Users/..." on Windows and "file:///tmp/..." on
        # Linux/macOS.
        cmd = [
            libreoffice,
            "--headless",
            "--nologo",
            "--norestore",
            f"-env:UserInstallation={profile_dir.as_uri()}",
            "--convert-to", convert_to,
            "--outdir", str(tmp_path),
            str(pptx_path),
        ]
        # Popen rather than `subprocess.run(timeout=...)`: on a timeout the
        # whole process tree has to come down (see `_kill_soffice_tree`),
        # and the timing log separates "LibreOffice was slow" from "the
        # report itself was slow to build", which the total alone hides.
        popen_kwargs: dict[str, Any] = {}
        if os.name != "nt":
            # Give soffice its own process group so the kill above can take
            # the tree down without signalling uvicorn itself.
            popen_kwargs["start_new_session"] = True
        t_convert = time.monotonic()
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            **popen_kwargs,
        )
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            _kill_soffice_tree(proc)
            try:
                # The tree is gone now, so the pipes can finally be closed.
                proc.communicate(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
            raise RuntimeError(
                f"LibreOffice conversion timed out after {timeout}s "
                f"(cmd={' '.join(cmd)})"
            ) from exc
        elapsed = time.monotonic() - t_convert
        out_ext = convert_to.split(":", 1)[0]
        out_path = tmp_path / f"report.{out_ext}"
        if proc.returncode != 0 or not out_path.exists():
            detail = (stderr or "").strip() or (stdout or "").strip() or "(no output from soffice)"
            raise RuntimeError(
                f"LibreOffice conversion failed (returncode={proc.returncode}, "
                f"{elapsed:.1f}s): {detail} | cmd={' '.join(cmd)}"
            )
        logger.info("soffice --convert-to %s completed in %.1fs", out_ext, elapsed)
        return out_path.read_bytes()


def _convert_pptx_to_pdf(pptx_bytes: bytes) -> bytes:
    return _run_soffice_convert(pptx_bytes, "pdf", timeout=90)


def _convert_pptx_to_png_direct(pptx_bytes: bytes) -> bytes:
    """Fast path: PPTX -> PNG in a single LibreOffice pass, at a fixed
    pixel resolution matching an A4 page. This skips the PDF step and the
    PyMuPDF render entirely, roughly halving image-export time."""
    width_px = round(A4_W * _PNG_EXPORT_DPI)
    height_px = round(A4_H * _PNG_EXPORT_DPI)
    filter_opts = (
        'png:impress_png_Export:{"PixelWidth":{"type":"long","value":%d},'
        '"PixelHeight":{"type":"long","value":%d}}' % (width_px, height_px)
    )
    # 90s (not 60s): a cold LibreOffice profile can be genuinely slow to
    # spin up on some machines (Windows + AV scanning in particular), and a
    # premature timeout here just forces the slower PDF fallback anyway.
    return _run_soffice_convert(pptx_bytes, filter_opts, timeout=90)


def _convert_pptx_to_png_via_pdf(pptx_bytes: bytes) -> bytes:
    """Fallback path (used only if the direct PNG export fails on a given
    LibreOffice build): PPTX -> PDF -> PyMuPDF -> PNG, as before."""
    pdf_bytes = _convert_pptx_to_pdf(pptx_bytes)
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if document.page_count == 0:
            raise RuntimeError("Generated PDF contains no pages.")
        page = document.load_page(0)
        matrix = fitz.Matrix(2.5, 2.5)
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        png_bytes = pixmap.tobytes("png")
        if not png_bytes:
            raise RuntimeError("PNG rendering returned empty data.")
        return png_bytes
    finally:
        document.close()


def _convert_pptx_to_png(pptx_bytes: bytes) -> bytes:
    """Convert the generated A4 PPTX report into a PNG image, preferring
    the fast direct PPTX->PNG LibreOffice path and falling back to the
    PPTX->PDF->PyMuPDF pipeline if that isn't available/working."""
    try:
        return _convert_pptx_to_png_direct(pptx_bytes)
    except Exception as exc:
        logger.warning("Direct PPTX->PNG export failed, falling back to PDF pipeline: %s", exc)
    try:
        return _convert_pptx_to_png_via_pdf(pptx_bytes)
    except Exception as exc:
        logger.error("PPTX -> PNG conversion failed: %s", exc, exc_info=True)
        raise RuntimeError(f"PNG conversion failed: {exc}") from exc


def _get_single_record_or_404(prediction_id: str, user_id: str):
    try:
        record = get_prediction_by_id(prediction_id, user_id=user_id)
    except Exception as exc:
        logger.error("Report record lookup failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=404, detail="Record not found") from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


# -----------------------------------------------------------------------------
# API endpoints — single-record only
# -----------------------------------------------------------------------------
@router.get(
    "/pptx/single/{prediction_id}",
    summary="Generate one WheatGuard AI field diagnostic report as PPTX",
)
async def generate_single_pptx(
    prediction_id: str = ApiPath(..., description="Prediction UUID"),
    user_id: str = Depends(get_current_user_id),
) -> StreamingResponse:
    record = _get_single_record_or_404(prediction_id, user_id)
    t0 = time.monotonic()
    try:
        # PPTX building itself is pure CPU + local file work; still worth
        # keeping off the event loop so other requests aren't blocked.
        pptx_bytes = await asyncio.to_thread(_build_single_report_pptx, record)
    except Exception as exc:
        logger.error("pptx single: build failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PPTX generation failed: {exc}") from exc
    logger.info("pptx single generated in %.2fs", time.monotonic() - t0)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"WheatGuard_{prediction_id[:8]}_{ts}.pptx"
    return StreamingResponse(
        io.BytesIO(pptx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/pdf/single/{prediction_id}",
    summary="Download a single prediction as PDF",
)
async def download_single_pdf(
    prediction_id: str = ApiPath(..., description="Prediction UUID"),
    user_id: str = Depends(get_current_user_id),
) -> StreamingResponse:
    record = _get_single_record_or_404(prediction_id, user_id)
    t0 = time.monotonic()
    try:
        pptx_bytes = await asyncio.to_thread(_build_single_report_pptx, record)
        async with _LO_SEMAPHORE:
            pdf_bytes = await asyncio.to_thread(_convert_pptx_to_pdf, pptx_bytes)
    except Exception as exc:
        logger.error("pdf single: export failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
    logger.info("pdf single generated in %.2fs", time.monotonic() - t0)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    fname = f"WheatGuard_{prediction_id[:8]}_{ts}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get(
    "/image/single/{prediction_id}",
    summary="Download a single prediction as PNG image",
)
async def download_single_image(
    prediction_id: str = ApiPath(..., description="Prediction UUID"),
    user_id: str = Depends(get_current_user_id),
) -> StreamingResponse:
    record = _get_single_record_or_404(prediction_id, user_id)
    t0 = time.monotonic()
    build_s = convert_s = 0.0
    try:
        t_build = time.monotonic()
        pptx_bytes = await asyncio.to_thread(_build_single_report_pptx, record)
        build_s = time.monotonic() - t_build
        t_convert = time.monotonic()
        async with _LO_SEMAPHORE:
            png_bytes = await asyncio.to_thread(_convert_pptx_to_png, pptx_bytes)
        convert_s = time.monotonic() - t_convert
    except Exception as exc:
        logger.error("image single: export failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Image generation failed: {exc}")
    # Split timing: "image single generated in 362s" hides whether the
    # report took that long to assemble or LibreOffice took that long to
    # render it, and those two have completely different fixes.
    logger.info(
        "image single generated in %.2fs (report built %.1fs, rendered %.1fs)",
        time.monotonic() - t0,
        build_s,
        convert_s,
    )
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    fname = f"WheatGuard_{prediction_id[:8]}_{ts}.png"
    return StreamingResponse(
        io.BytesIO(png_bytes),
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )