const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const analyzeBtn = document.getElementById("analyzeBtn");

const loading = document.getElementById("loading");
const result = document.getElementById("result");

const status = document.getElementById("status");
const confidence = document.getElementById("confidence");


// Show selected image
imageInput.addEventListener("change", function () {

    const file = imageInput.files[0];

    if (!file) {
        return;
    }

    const imageURL = URL.createObjectURL(file);

    preview.src = imageURL;
    preview.style.display = "block";

    result.style.display = "none";
});


// Analyze image
analyzeBtn.addEventListener("click", async function () {

    const file = imageInput.files[0];

    if (!file) {
        alert("Please select a soil image first.");
        return;
    }

    loading.style.display = "block";
    result.style.display = "none";

    const formData = new FormData();

    formData.append("image", file);

    try {

        const response = await fetch(
            "http://127.0.0.1:5000/predict",
            {
                method: "POST",
                body: formData
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Prediction failed");
        }

        status.textContent =
            "Moisture Status: " + data.status.toUpperCase();

        confidence.textContent =
            "Confidence: " + data.confidence + "%";

        result.style.display = "block";

    } catch (error) {

        alert("Error: " + error.message);

    } finally {

        loading.style.display = "none";

    }

});