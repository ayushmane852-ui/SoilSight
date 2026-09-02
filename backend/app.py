from flask import Flask, request, jsonify
from flask_cors import CORS
from tensorflow.keras.models import load_model
from PIL import Image
import numpy as np
import os

app = Flask(__name__)
CORS(app)

# Path to trained SoilSight model
MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "models",
    "soilsight_moisture_model.keras"
)

# Load model
print("Loading SoilSight model...")
model = load_model(MODEL_PATH)
print("Model loaded successfully!")

# IMPORTANT:
# Keep the same order used during model training
class_names = ["dry", "moderate", "wet"]


@app.route("/")
def home():
    return jsonify({
        "message": "SoilSight backend is running"
    })


@app.route("/predict", methods=["POST"])
def predict():

    # Check whether image was uploaded
    if "image" not in request.files:
        return jsonify({
            "error": "No image uploaded"
        }), 400

    file = request.files["image"]

    try:
        # Open image
        img = Image.open(file).convert("RGB")

        # Same input size used during training
        img = img.resize((224, 224))

        # Convert image to NumPy array
        img_array = np.array(img)

        # Add batch dimension
        img_array = np.expand_dims(img_array, axis=0)

        # Normalize pixel values
        img_array = img_array / 255.0

        # Model prediction
        prediction = model.predict(img_array, verbose=0)

        # Find highest probability
        predicted_index = np.argmax(prediction[0])

        predicted_class = class_names[predicted_index]

        confidence = float(
            prediction[0][predicted_index] * 100
        )

        return jsonify({
            "status": predicted_class,
            "confidence": round(confidence, 2)
        })

    except Exception as e:

        return jsonify({
            "error": str(e)
        }), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )