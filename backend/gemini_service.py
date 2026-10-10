"""
SoilSight AI Service: Multimodal Gemini Vision & Fallback Diagnostic Engine
Provides Soil Type, Soil Health (Good, Moderate, Poor), Health Score (0-100),
Key Physical Indicators, Recommended Crops, and Agronomic Guidance.
"""

import os
import json
import io
import numpy as np
from PIL import Image
from dotenv import load_dotenv

# Load environment variables from backend/.env or root .env
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None, None
    
    try:
        from google import genai
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
        client = genai.Client(api_key=api_key)
        return client, model_name
    except Exception as e:
        print(f"Failed to initialize Gemini client: {e}")
        return None, None


def analyze_with_gemini(pil_img, moisture="moderate", confidence=95.0):
    client, model_name = get_gemini_client()
    if not client:
        return None

    prompt = f"""
You are an expert agronomic soil scientist and precision agriculture specialist.
Analyze this high-resolution photograph of agricultural soil.
The verified sensor/ML moisture level is '{moisture}' (confidence: {confidence:.1f}%).

Provide a comprehensive, authoritative agronomic diagnosis in strict JSON format.
The JSON must adhere precisely to this structure:
{{
  "soil_type": "Loamy Soil", // Must be one of: "Alluvial Soil", "Clayey Soil", "Loamy Soil", "Red Soil", "Sandy Loam", "Sandy Soil", "Black Soil"
  "soil_type_description": "A well-balanced mixture of sand, silt, and clay offering superior moisture retention and aeration.",
  "soil_health": "Good", // Must be one of: "Good", "Moderate", "Poor"
  "health_score": 85, // Integer between 0 and 100 based on organic matter, visible humus, tilth, aeration, and crumb structure
  "health_summary": "Rich crumbly aggregation with visible organic humus and balanced structure.",
  "key_indicators": [
    "Dark, nutrient-dense color indicating high organic carbon",
    "Porous crumb aggregation facilitating root respiration",
    "Balanced moisture distribution without visible surface compaction"
  ],
  "recommended_crops": [
    "Wheat", "Cotton", "Sugarcane", "Tomato", "Soybeans"
  ],
  "soil_amendments": "Apply farmyard manure (FYM) or vermicompost at 2 tons/acre before sowing. Incorporate nitrogen-fixing cover crops like clover or cowpea.",
  "irrigation_action": "Maintain optimal root-zone moisture with scheduled micro-sprinklers or drip irrigation."
}}
Ensure the recommendations are practical for a real farmer. Return ONLY valid JSON, with no markdown code fences or conversational text.
"""

    try:
        from google.genai import types

        # Ensure image is in RGB format
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        # Convert PIL image to bytes
        img_byte_arr = io.BytesIO()
        pil_img.save(img_byte_arr, format="JPEG", quality=90)
        img_bytes = img_byte_arr.getvalue()

        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(
                    data=img_bytes,
                    mime_type="image/jpeg",
                ),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        raw_text = response.text.strip()
        # Clean potential markdown wrapping if returned
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]

        parsed = json.loads(raw_text.strip())
        parsed["ai_engine"] = f"Gemini Multimodal AI ({model_name})"
        return parsed

    except Exception as e:
        print(f"Gemini API request failed ({e}). Falling back to local diagnostic engine.")
        return None


def analyze_with_local_engine(pil_img, moisture="moderate", confidence=95.0):
    """
    Intelligent computer-vision heuristic fallback engine.
    Analyzes color tones, lightness, red/green chromaticity, and moisture status
    to classify into the standard agricultural soil categories and health index.
    """
    # Resize for fast color-profile computation
    small = pil_img.resize((100, 100)).convert("RGB")
    arr = np.array(small, dtype=np.float32)

    r_mean = float(np.mean(arr[:, :, 0]))
    g_mean = float(np.mean(arr[:, :, 1]))
    b_mean = float(np.mean(arr[:, :, 2]))
    brightness = (r_mean + g_mean + b_mean) / 3.0

    # Color ratios
    red_ratio = r_mean / (g_mean + b_mean + 1e-5)
    saturation = float(np.std(arr[:, :, :3]))

    # Heuristic soil type classification matching dataset ground-truth categories
    if red_ratio > 0.95 and r_mean > 115 and (r_mean - g_mean) > 28:
        soil_type = "Red Soil"
        description = "Rich in iron oxides with porous crumbly structure; good drainage but requires phosphorus replenishment."
        crops = ["Groundnut", "Pulses", "Millets", "Tobacco", "Cotton"]
        amendments = "Add farmyard manure, zinc sulphate, and single super phosphate (SSP) to balance acidity and boost fertility."
        base_health = 74
    elif brightness < 82:
        soil_type = "Clayey Soil"
        description = "Fine-textured clay particles with high water holding capacity and strong nutrient retention."
        crops = ["Paddy Rice", "Wheat", "Sugarcane", "Mustard"]
        amendments = "Incorporate gypsum and organic leaf compost to loosen compacted clay and enhance soil aeration."
        base_health = 80
    elif brightness > 145 and saturation < 35:
        soil_type = "Sandy Soil"
        description = "Coarse granular texture with rapid drainage and low natural nutrient holding capacity."
        crops = ["Watermelon", "Carrots", "Peanuts", "Barley", "Gram"]
        amendments = "Apply heavy biochar, humic acid, and mulching to prevent rapid nutrient leaching and moisture loss."
        base_health = 62
    elif brightness > 120 and red_ratio < 0.85:
        soil_type = "Sandy Loam"
        description = "Balanced blend of sand and loam; warms up rapidly and offers effortless root penetration."
        crops = ["Maize", "Potato", "Tomato", "Cotton", "Chili"]
        amendments = "Apply well-decomposed compost (2 tons/acre) and nitrogenous biofertilizers (Azotobacter)."
        base_health = 84
    elif r_mean > 95 and g_mean > 85 and abs(r_mean - g_mean) < 18:
        soil_type = "Alluvial Soil"
        description = "Fertile silt and river sediment deposited rich in potash, lime, and organic loam."
        crops = ["Wheat", "Paddy", "Sugarcane", "Jute", "Oilseeds"]
        amendments = "Maintain nitrogen-phosphorus balance using DAP and organic green manure (Dhaincha/Sunn hemp)."
        base_health = 88
    else:
        soil_type = "Loamy Soil"
        description = "The gold standard of agricultural soils, balancing silt, clay, and sand with optimal aeration."
        crops = ["Wheat", "Soybean", "Maize", "Cotton", "Vegetables"]
        amendments = "Top-dress with vermicompost and neem cake to boost beneficial soil microbiome."
        base_health = 90

    # Adjust health score based on moisture compatibility
    health_score = base_health
    if moisture == "moderate":
        health_score = min(96, health_score + 6)
        health_status = "Good"
        health_summary = f"Optimal moisture balance actively supports healthy root respiration and nutrient uptake for {soil_type}."
        irrigation_action = "No irrigation required today. Maintain organic soil mulching to conserve balanced moisture."
    elif moisture == "dry":
        health_score = max(45, health_score - 15)
        health_status = "Moderate" if health_score >= 65 else "Poor"
        health_summary = f"Depleted moisture limits nutrient assimilation in {soil_type}, leading to temporary moisture stress."
        irrigation_action = "Provide scheduled irrigation within 24 hours via drip or micro-sprinkler during cool hours."
    else: # wet
        health_score = max(55, health_score - 10)
        health_status = "Moderate"
        health_summary = f"Elevated water saturation in {soil_type} temporarily restricts root oxygen availability."
        irrigation_action = "Pause irrigation and clear surface drainage ditches to prevent anaerobic root stress."

    indicators = [
        f"Aggregated particle texture consistent with {soil_type}",
        f"Current condition index evaluated at {health_score}/100",
        f"Microbial habitat activity level: {'High' if health_score >= 80 else 'Moderate'}",
    ]

    has_api_key = bool(os.getenv("GEMINI_API_KEY", "").strip())
    engine_label = "Local Diagnostic Vision Engine" if not has_api_key else "Local Engine (Gemini fallback)"

    return {
        "soil_type": soil_type,
        "soil_type_description": description,
        "soil_health": health_status,
        "health_score": int(health_score),
        "health_summary": health_summary,
        "key_indicators": indicators,
        "recommended_crops": crops,
        "soil_amendments": amendments,
        "irrigation_action": irrigation_action,
        "ai_engine": engine_label,
        "is_fallback": True,
        "has_api_key": has_api_key
    }


def diagnose_soil_attributes(pil_img, moisture="moderate", confidence=95.0):
    """
    Main entry point for soil diagnostic.
    Attempts Gemini Vision first; falls back smoothly to local engine if needed.
    """
    # 1. Try Gemini Multimodal AI
    gemini_result = analyze_with_gemini(pil_img, moisture, confidence)
    if gemini_result:
        gemini_result["is_fallback"] = False
        gemini_result["has_api_key"] = True
        return gemini_result

    # 2. Local Fallback Engine
    return analyze_with_local_engine(pil_img, moisture, confidence)
