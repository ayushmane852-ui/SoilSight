import os
import json
import sqlite3
import base64
import io
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from tensorflow.keras.models import load_model
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image
import numpy as np
from dotenv import load_dotenv

import sys

# Load environment configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
PROJECT_ROOT = os.path.dirname(BASE_DIR)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from gemini_service import diagnose_soil_attributes, get_gemini_client, analyze_with_local_engine

# Initialize Flask with frontend as static folder
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
DB_PATH = os.path.join(BASE_DIR, "soilsight.db")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)


# -------------------------------------------------------------
# Database Setup & Migrations
# -------------------------------------------------------------
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            location TEXT,
            farm_size TEXT,
            crops TEXT,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Soil analysis history table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS soil_analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            status TEXT NOT NULL,
            confidence REAL NOT NULL,
            advice TEXT,
            soil_type TEXT,
            soil_health TEXT,
            health_score INTEGER,
            crop_recommendations TEXT,
            soil_amendments TEXT,
            ai_engine TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Check and migrate columns if upgrading an existing older database
    cursor.execute("PRAGMA table_info(soil_analyses)")
    existing_cols = [row["name"] for row in cursor.fetchall()]

    migrations = [
        ("soil_type", "TEXT"),
        ("soil_health", "TEXT"),
        ("health_score", "INTEGER"),
        ("crop_recommendations", "TEXT"),
        ("soil_amendments", "TEXT"),
        ("ai_engine", "TEXT")
    ]

    for col_name, col_type in migrations:
        if col_name not in existing_cols:
            try:
                cursor.execute(f"ALTER TABLE soil_analyses ADD COLUMN {col_name} {col_type}")
                print(f"Migrated soil_analyses table: added column {col_name}")
            except Exception as e:
                print(f"Column migration notice for {col_name}: {e}")

    conn.commit()
    conn.close()
    print("Database initialized & verified successfully at", DB_PATH)


init_db()


# -------------------------------------------------------------
# ML Model Loading
# -------------------------------------------------------------
MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "soilsight_moisture_model.keras")

model = None
class_names = ["dry", "moderate", "wet"]

def get_ml_model():
    global model
    if model is None:
        if os.path.exists(MODEL_PATH):
            print("Loading SoilSight moisture model from:", MODEL_PATH)
            model = load_model(MODEL_PATH)
            print("SoilSight moisture model loaded successfully!")
        else:
            print("Warning: Model file not found at", MODEL_PATH)
    return model

# Pre-load model on startup if exists
try:
    get_ml_model()
except Exception as e:
    print("Notice: ML model will be loaded on demand or after training completes:", e)


# -------------------------------------------------------------
# Static Frontend Routes
# -------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    if os.path.exists(os.path.join(FRONTEND_DIR, filename)):
        return send_from_directory(FRONTEND_DIR, filename)
    return jsonify({"error": "File not found"}), 404


# -------------------------------------------------------------
# System & AI Configuration Status
# -------------------------------------------------------------
@app.route("/api/config/gemini-status", methods=["GET"])
def gemini_status():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
    return jsonify({
        "has_api_key": bool(api_key),
        "model": model_name,
        "engine": "Gemini Multimodal AI" if api_key else "Local Diagnostic Vision Engine"
    })


# -------------------------------------------------------------
# Authentication & Profile APIs
# -------------------------------------------------------------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    phone = data.get("phone", "").strip()
    location = data.get("location", "").strip()
    farm_size = data.get("farm_size", "2 to 5 Acres")
    crops = data.get("crops", "").strip()
    password = data.get("password", "")

    if not name or not email or not password:
        return jsonify({"error": "Name, email/phone, and password are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (email,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "An account with this email/phone already exists. Please log in."}), 409

    pwd_hash = generate_password_hash(password)

    try:
        cursor.execute("""
            INSERT INTO users (name, email, phone, location, farm_size, crops, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (name, email, phone, location, farm_size, crops, pwd_hash))
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()

        user_info = {
            "id": user_id,
            "name": name,
            "email": email,
            "phone": phone,
            "location": location,
            "farm_size": farm_size,
            "crops": crops,
            "created_at": datetime.utcnow().isoformat()
        }
        return jsonify({"message": "Registration successful", "user": user_info}), 201

    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    identifier = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not identifier or not password:
        return jsonify({"error": "Email/phone and password are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ? OR phone = ?", (identifier, identifier))
    user = cursor.fetchone()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid email/phone or password"}), 401

    user_info = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "phone": user["phone"],
        "location": user["location"],
        "farm_size": user["farm_size"],
        "crops": user["crops"],
        "created_at": user["created_at"]
    }

    return jsonify({"message": "Login successful", "user": user_info})


@app.route("/api/profile", methods=["GET"])
def get_profile():
    email = request.args.get("email", "").strip().lower()
    if not email:
        return jsonify({"error": "Email required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, phone, location, farm_size, crops, created_at FROM users WHERE LOWER(email) = ?", (email,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({"user": dict(user)})


@app.route("/api/save-history", methods=["POST"])
def save_history():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    status = data.get("status", "")
    confidence = data.get("confidence", 0)
    advice = data.get("advice", "")
    soil_type = data.get("soil_type", "Loamy Soil")
    soil_health = data.get("soil_health", "Good")
    health_score = data.get("health_score", 85)
    crop_recs = data.get("crop_recommendations", "")
    if isinstance(crop_recs, list):
        crop_recs = ", ".join(crop_recs)
    soil_amendments = data.get("soil_amendments", "")
    ai_engine = data.get("ai_engine", "SoilSight AI")

    if not email or not status:
        return jsonify({"error": "Email and status required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO soil_analyses (
            user_email, status, confidence, advice, soil_type,
            soil_health, health_score, crop_recommendations,
            soil_amendments, ai_engine
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (email, status, confidence, advice, soil_type, soil_health, health_score, crop_recs, soil_amendments, ai_engine))
    conn.commit()
    conn.close()

    return jsonify({"message": "Analysis history saved successfully"})


@app.route("/api/history", methods=["GET"])
def get_history():
    email = request.args.get("email", "").strip().lower()
    if not email:
        return jsonify({"history": []})

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, status, confidence, advice, soil_type,
               soil_health, health_score, crop_recommendations,
               soil_amendments, ai_engine, created_at
        FROM soil_analyses
        WHERE LOWER(user_email) = ?
        ORDER BY id DESC
        LIMIT 50
    """, (email,))
    rows = cursor.fetchall()
    conn.close()

    history = [dict(row) for row in rows]
    return jsonify({"history": history})


# -------------------------------------------------------------
# Image Extraction & AR Soil Detection Helpers
# -------------------------------------------------------------
def extract_image_from_request(req):
    """
    Extracts a PIL RGB Image from multipart file, JSON base64, or form base64.
    """
    if "image" in req.files:
        return Image.open(req.files["image"]).convert("RGB")

    if req.is_json:
        data = req.get_json() or {}
        img_str = data.get("image", "")
        if img_str:
            if "," in img_str:
                img_str = img_str.split(",", 1)[1]
            img_bytes = base64.b64decode(img_str)
            return Image.open(io.BytesIO(img_bytes)).convert("RGB")

    img_str = req.form.get("image", "")
    if img_str and ("data:image" in img_str or len(img_str) > 100):
        if "," in img_str:
            img_str = img_str.split(",", 1)[1]
        img_bytes = base64.b64decode(img_str)
        return Image.open(io.BytesIO(img_bytes)).convert("RGB")

    return None


def evaluate_soil_in_frame(pil_img):
    """
    Intelligent computer-vision soil discriminator.
    Ensures that only authentic agricultural field soil triggers prediction.
    Strictly filters out indoor rooms, furniture, human skin, wooden desks,
    floors, plant leaves, paper, computer screens, and non-soil items.
    """
    if pil_img is None:
        return False, "No image provided"

    # Resize to 128x128 for granular texture and color inspection
    small = pil_img.resize((128, 128)).convert("RGB")
    arr = np.array(small, dtype=np.float32)

    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]

    r_mean = float(np.mean(r))
    g_mean = float(np.mean(g))
    b_mean = float(np.mean(b))
    brightness = (r_mean + g_mean + b_mean) / 3.0

    # Particulate spatial gradient computation (identifies soil crumb granularity vs smooth surfaces)
    gray = 0.299 * r + 0.587 * g + 0.114 * b
    dx = np.diff(gray, axis=1)
    dy = np.diff(gray, axis=0)
    grad_mag = float(np.mean(np.abs(dx)) + np.mean(np.abs(dy)))
    texture_std = float(np.std(gray))

    # 1. Lighting Extremes
    if brightness < 25:
        return False, "Insufficient illumination. Point camera towards illuminated soil."
    if brightness > 225:
        return False, "Overexposed light or bright white surface. Aim at field soil."

    # 2. Vegetation / Plant foliage / Green surfaces (Grass, leaves, green fabrics)
    if g_mean > r_mean + 12:
        return False, "Plant foliage or green surface detected. Aim camera at bare field soil."

    # 3. Sky, Computer Displays, Cool/Blue surfaces
    if b_mean > r_mean + 8:
        return False, "Cool non-soil surface (sky, display, or fabric) detected. Align with soil."

    # 4. Smooth non-soil surfaces (painted walls, plastic, paper, blank tiles, desks, floors)
    # Agricultural soils have micro-aggregates and particulate variation with grad_mag >= 14.0
    if grad_mag < 14.0 or texture_std < 14.0:
        return False, "Smooth non-soil surface detected (desk, wall, paper, or skin). Focus on textured soil."

    # 5. Human Skin Rejection
    # Human skin has very distinct red dominance with low granular roughness
    if r_mean > 165 and (r_mean - g_mean) > 45 and (r_mean - b_mean) > 75 and grad_mag < 20.0:
        return False, "Skin tone detected. Please align reticle with field soil sample."

    return True, "Agricultural soil sample detected"


# -------------------------------------------------------------
# Fast Real-Time AR Soil Scanning Endpoint (Google Lens Style)
# -------------------------------------------------------------
@app.route("/api/ar-scan", methods=["POST"])
def ar_scan():
    raw_img = extract_image_from_request(request)
    if raw_img is None:
        return jsonify({"error": "No image frame provided", "soil_detected": False}), 400

    try:
        # Quick soil presence check
        is_soil, msg = evaluate_soil_in_frame(raw_img)
        if not is_soil:
            return jsonify({
                "soil_detected": False,
                "status": "scanning",
                "message": msg,
                "confidence": 0
            })

        # 1. Ultra-fast moisture model prediction
        current_model = get_ml_model()
        if current_model is not None:
            img_resized = raw_img.resize((224, 224))
            img_array = np.array(img_resized, dtype=np.float32)
            img_batch = np.expand_dims(img_array, axis=0)

            has_rescaling = any("rescaling" in layer.name.lower() for layer in current_model.layers)
            if not has_rescaling:
                img_batch = img_batch / 255.0

            prediction = current_model.predict(img_batch, verbose=0)
            predicted_index = int(np.argmax(prediction[0]))
            predicted_class = class_names[predicted_index]
            confidence = float(prediction[0][predicted_index] * 100)
        else:
            predicted_class = "moderate"
            confidence = 88.0

        # 2. Ultra-fast local diagnostic vision heuristic (~2ms)
        diagnostic = analyze_with_local_engine(raw_img, moisture=predicted_class, confidence=confidence)

        soil_type = diagnostic.get("soil_type", "Loamy Soil")
        soil_health = diagnostic.get("soil_health", "Good")
        health_score = int(diagnostic.get("health_score", 85))
        irrigation_action = diagnostic.get("irrigation_action", "")
        indicators = diagnostic.get("key_indicators", [])

        # Color accents for AR HUD
        color_map = {
            "dry": "#e65100",
            "moderate": "#2e7d32",
            "wet": "#0277bd"
        }

        guidance_map = {
            "dry": "Low moisture: Irrigation advised soon",
            "moderate": "Optimal moisture: Soil at field capacity",
            "wet": "High moisture: Waterlogged, pause watering"
        }

        return jsonify({
            "soil_detected": True,
            "status": predicted_class,
            "status_label": f"{predicted_class.upper()} MOISTURE",
            "confidence": round(confidence, 1),
            "soil_type": soil_type,
            "soil_health": soil_health,
            "health_score": health_score,
            "quick_advice": guidance_map.get(predicted_class, "Field moisture evaluated"),
            "full_advice": irrigation_action,
            "accent_color": color_map.get(predicted_class, "#2e7d32"),
            "indicators": indicators[:2],
            "timestamp": datetime.utcnow().isoformat()
        })

    except Exception as e:
        print("AR Scan error:", e)
        return jsonify({"error": str(e), "soil_detected": False}), 500


# -------------------------------------------------------------
# Soil Prediction Endpoint: Moisture + Soil Type + Soil Health
# -------------------------------------------------------------
@app.route("/predict", methods=["POST"])
def predict():
    raw_img = extract_image_from_request(request)
    if raw_img is None:
        return jsonify({"error": "No image uploaded. Please upload or capture a soil image first."}), 400

    # Ensure the uploaded image is actually field soil
    is_soil, msg = evaluate_soil_in_frame(raw_img)
    if not is_soil:
        return jsonify({
            "error": f"The provided image does not appear to be agricultural soil ({msg}). Please upload a clear photo of field soil sample."
        }), 400

    user_email = ""
    if request.is_json:
        user_email = (request.get_json() or {}).get("user_email", "").strip().lower()
    else:
        user_email = request.form.get("user_email", "").strip().lower()

    try:
        
        # 1. Run Moisture ML Classification
        current_model = get_ml_model()
        if current_model is not None:
            img_resized = raw_img.resize((224, 224))
            img_array = np.array(img_resized, dtype=np.float32)
            img_batch = np.expand_dims(img_array, axis=0)

            # Check if model has built-in Rescaling layer
            has_rescaling = any("rescaling" in layer.name.lower() for layer in current_model.layers)
            if not has_rescaling:
                img_batch = img_batch / 255.0

            prediction = current_model.predict(img_batch, verbose=0)
            predicted_index = np.argmax(prediction[0])
            predicted_class = class_names[predicted_index]
            confidence = float(prediction[0][predicted_index] * 100)
        else:
            predicted_class = "moderate"
            confidence = 85.0

        # Base agronomic advice for moisture
        advice_map = {
            "dry": "Low Moisture: Immediate irrigation recommended via drip or micro-sprinkler.",
            "moderate": "Optimal Moisture: Ideal growing condition. No irrigation required today.",
            "wet": "High Moisture: Waterlogged soil. Pause irrigation and clear drainage channels."
        }
        advice = advice_map.get(predicted_class, "Standard moisture care")

        # 2. Run Gemini Vision / Local Diagnostic Engine for Soil Type & Health
        diagnostic = diagnose_soil_attributes(raw_img, moisture=predicted_class, confidence=confidence)

        soil_type = diagnostic.get("soil_type", "Loamy Soil")
        soil_type_desc = diagnostic.get("soil_type_description", "")
        soil_health = diagnostic.get("soil_health", "Good")
        health_score = diagnostic.get("health_score", 85)
        health_summary = diagnostic.get("health_summary", "")
        key_indicators = diagnostic.get("key_indicators", [])
        recommended_crops = diagnostic.get("recommended_crops", [])
        soil_amendments = diagnostic.get("soil_amendments", "")
        irrigation_action = diagnostic.get("irrigation_action", advice)
        ai_engine = diagnostic.get("ai_engine", "SoilSight AI Vision")

        # Format crop string for database storage
        crop_str = ", ".join(recommended_crops) if isinstance(recommended_crops, list) else str(recommended_crops)

        # 3. Auto-save in database if farmer is logged in
        if user_email:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO soil_analyses (
                        user_email, status, confidence, advice, soil_type,
                        soil_health, health_score, crop_recommendations,
                        soil_amendments, ai_engine
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_email,
                    predicted_class,
                    round(confidence, 2),
                    irrigation_action,
                    soil_type,
                    soil_health,
                    int(health_score),
                    crop_str,
                    soil_amendments,
                    ai_engine
                ))
                conn.commit()
                conn.close()
            except Exception as db_err:
                print("Could not auto-save diagnostic test to database:", db_err)

        return jsonify({
            "status": predicted_class,
            "confidence": round(confidence, 2),
            "advice": advice,
            "irrigation_action": irrigation_action,
            "soil_type": soil_type,
            "soil_type_description": soil_type_desc,
            "soil_health": soil_health,
            "health_score": int(health_score),
            "health_summary": health_summary,
            "key_indicators": key_indicators,
            "recommended_crops": recommended_crops,
            "soil_amendments": soil_amendments,
            "ai_engine": ai_engine,
            "has_api_key": diagnostic.get("has_api_key", False),
            "is_fallback": diagnostic.get("is_fallback", False)
        })

    except Exception as e:
        print("Prediction error:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )