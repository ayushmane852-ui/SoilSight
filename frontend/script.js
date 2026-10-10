// SoilSight Precision Soil Diagnostic Script
// Multi-Pillar Assessment: Moisture, Soil Type, and Soil Health powered by Gemini Multimodal AI
document.addEventListener("DOMContentLoaded", function () {
    const API_BASE = window.location.origin.includes(":5000") ? "" : "http://127.0.0.1:5000";

    const imageInput = document.getElementById("imageInput");
    const dropzone = document.getElementById("dropzone");
    const previewContainer = document.getElementById("previewContainer");
    const preview = document.getElementById("preview");
    const changeImageBtn = document.getElementById("changeImageBtn");
    const analyzeBtn = document.getElementById("analyzeBtn");

    const loading = document.getElementById("loading");
    const result = document.getElementById("result");

    // Header & Engine Badges
    const aiStatusPill = document.getElementById("aiStatusPill");
    const aiStatusText = document.getElementById("aiStatusText");
    const aiEngineBadge = document.getElementById("aiEngineBadge");
    const healthBadge = document.getElementById("healthBadge");
    const reportTimestamp = document.getElementById("reportTimestamp");

    // Health Gauge
    const gaugeScoreVal = document.getElementById("gaugeScoreVal");
    const healthGaugeCircle = document.getElementById("healthGaugeCircle");

    // Pillar 1: Moisture Elements
    const moistureStatusChip = document.getElementById("moistureStatusChip");
    const moistureConfidenceVal = document.getElementById("moistureConfidenceVal");
    const confidenceBar = document.getElementById("confidenceBar");
    const moistureNote = document.getElementById("moistureNote");

    // Pillar 2: Soil Type Elements
    const soilTypeChip = document.getElementById("soilTypeChip");
    const soilTypeDesc = document.getElementById("soilTypeDesc");

    // Pillar 3: Soil Health Elements
    const healthStatusChip = document.getElementById("healthStatusChip");
    const healthSummaryText = document.getElementById("healthSummaryText");

    // Indicators & Crops
    const indicatorsList = document.getElementById("indicatorsList");
    const cropChipsContainer = document.getElementById("cropChipsContainer");

    // Advice & Amendments
    const adviceTitle = document.getElementById("adviceTitle");
    const adviceText = document.getElementById("adviceText");
    const amendmentText = document.getElementById("amendmentText");
    const resetBtn = document.getElementById("resetBtn");

    // Farmer Profile Nav
    const farmerPill = document.getElementById("farmerPill");
    const farmerNameNav = document.getElementById("farmerNameNav");

    let currentSelectedFile = null;

    // Display logged in farmer if available
    const currentFarmer = typeof getCurrentFarmer === "function" ? getCurrentFarmer() : null;
    if (currentFarmer && farmerPill && farmerNameNav) {
        farmerNameNav.textContent = currentFarmer.name;
        farmerPill.style.display = "inline-flex";
    }

    // Check Gemini API Configuration Status from Backend
    async function checkAiStatus() {
        try {
            const res = await fetch(`${API_BASE}/api/config/gemini-status`);
            if (res.ok) {
                const data = await res.json();
                if (data.has_api_key) {
                    if (aiStatusText) aiStatusText.textContent = "✨ Gemini Vision Active";
                    if (aiStatusPill) aiStatusPill.classList.add("status-gemini-active");
                } else {
                    if (aiStatusText) aiStatusText.textContent = "🌱 Vision Engine Ready";
                }
            }
        } catch (e) {
            console.log("Status check note: backend running locally");
        }
    }
    checkAiStatus();

    // -------------------------------------------------------------
    // Image Selection & Dropzone Interactions
    // -------------------------------------------------------------
    function handleFileSelected(file) {
        if (!file || !file.type.startsWith("image/")) {
            alert("Please select a valid image file (JPG, PNG, or WEBP).");
            return;
        }

        currentSelectedFile = file;
        const imageURL = URL.createObjectURL(file);
        preview.src = imageURL;
        
        dropzone.style.display = "none";
        previewContainer.style.display = "block";
        analyzeBtn.disabled = false;

        if (result) {
            result.style.display = "none";
        }
    }

    if (imageInput) {
        imageInput.addEventListener("change", function () {
            if (imageInput.files && imageInput.files[0]) {
                handleFileSelected(imageInput.files[0]);
            }
        });
    }

    if (changeImageBtn) {
        changeImageBtn.addEventListener("click", function () {
            imageInput.value = "";
            currentSelectedFile = null;
            preview.src = "";
            previewContainer.style.display = "none";
            dropzone.style.display = "block";
            analyzeBtn.disabled = true;
            if (result) result.style.display = "none";
        });
    }

    // Drag and Drop
    if (dropzone) {
        ["dragenter", "dragover"].forEach(eventName => {
            dropzone.addEventListener(eventName, function (e) {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add("dropzone-dragover");
            }, false);
        });

        ["dragleave", "drop"].forEach(eventName => {
            dropzone.addEventListener(eventName, function (e) {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove("dropzone-dragover");
            }, false);
        });

        dropzone.addEventListener("drop", function (e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files[0]) {
                handleFileSelected(files[0]);
            }
        });
    }

    // Reset button
    if (resetBtn) {
        resetBtn.addEventListener("click", function () {
            if (imageInput) imageInput.value = "";
            currentSelectedFile = null;
            if (preview) {
                preview.src = "";
            }
            if (previewContainer) previewContainer.style.display = "none";
            if (dropzone) dropzone.style.display = "block";
            if (analyzeBtn) analyzeBtn.disabled = true;
            if (result) result.style.display = "none";
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // -------------------------------------------------------------
    // Soil Diagnostic Execution
    // -------------------------------------------------------------
    if (analyzeBtn) {
        analyzeBtn.addEventListener("click", async function () {
            if (!currentSelectedFile) {
                alert("Please select or capture a soil image first.");
                return;
            }

            loading.style.display = "flex";
            if (result) result.style.display = "none";
            analyzeBtn.disabled = true;

            const formData = new FormData();
            formData.append("image", currentSelectedFile);
            if (currentFarmer && currentFarmer.email) {
                formData.append("user_email", currentFarmer.email);
            }

            try {
                const response = await fetch(`${API_BASE}/predict`, {
                    method: "POST",
                    body: formData
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Soil diagnostic failed. Check backend server.");
                }

                renderDiagnosticReport(data);

            } catch (error) {
                console.error("Analysis error:", error);
                alert("Error: " + error.message + "\n\nTip: Ensure SoilSight backend is running (python backend/app.py).");
            } finally {
                loading.style.display = "none";
                analyzeBtn.disabled = false;
            }
        });
    }

    // -------------------------------------------------------------
    // Render Complete Diagnostic Report
    // -------------------------------------------------------------
    function renderDiagnosticReport(data) {
        const moistureStr = (data.status || "moderate").toLowerCase();
        const confVal = parseFloat(data.confidence) || 0;
        const soilType = data.soil_type || "Loamy Soil";
        const soilTypeDescText = data.soil_type_description || "Balanced agricultural soil texture with good capillary structure.";
        const soilHealth = data.soil_health || "Good";
        const healthScore = parseInt(data.health_score) || 85;
        const healthSummary = data.health_summary || "Soil aggregation and biological aeration balance are well-maintained.";
        const indicators = data.key_indicators || [];
        const recommendedCrops = data.recommended_crops || [];
        const soilAmendments = data.soil_amendments || "Apply organic compost or well-rotted farmyard manure to preserve fertility.";
        const irrigationAction = data.irrigation_action || data.advice || "Standard irrigation protocol.";
        const aiEngine = data.ai_engine || "Gemini Multimodal AI";

        // Timestamp
        if (reportTimestamp) {
            const now = new Date();
            reportTimestamp.textContent = `Generated on ${now.toLocaleDateString()} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        // Engine Badge
        if (aiEngineBadge) {
            aiEngineBadge.textContent = aiEngine.includes("Gemini") ? "✨ " + aiEngine : "🌱 " + aiEngine;
        }

        // Health Score & Gauge
        if (gaugeScoreVal) gaugeScoreVal.textContent = healthScore + "%";
        if (healthBadge) {
            healthBadge.textContent = "Soil Health: " + soilHealth.toUpperCase();
            healthBadge.className = "health-badge health-" + soilHealth.toLowerCase();
        }

        if (healthGaugeCircle) {
            let gaugeColor = "#2e7d32"; // Good
            if (soilHealth.toLowerCase() === "moderate") gaugeColor = "#f57c00";
            if (soilHealth.toLowerCase() === "poor") gaugeColor = "#d32f2f";
            healthGaugeCircle.style.background = `conic-gradient(${gaugeColor} ${healthScore * 3.6}deg, #e0e0e0 0deg)`;
        }

        // Pillar 1: Moisture
        const moistureConfigs = {
            dry: { label: "DRY SOIL", color: "#e65100", chipClass: "chip-dry", note: "Critically low moisture. Root uptake is inhibited. Irrigation required." },
            moderate: { label: "MODERATE", color: "#2e7d32", chipClass: "chip-moderate", note: "Optimal field capacity. Ideal moisture balance for crop nutrient absorption." },
            wet: { label: "WET / SATURATED", color: "#0277bd", chipClass: "chip-wet", note: "High saturation. Drainage recommended to prevent root hypoxia." }
        };
        const mConfig = moistureConfigs[moistureStr] || moistureConfigs.moderate;

        if (moistureStatusChip) {
            moistureStatusChip.textContent = mConfig.label;
            moistureStatusChip.className = "status-chip " + mConfig.chipClass;
        }
        if (moistureConfidenceVal) {
            moistureConfidenceVal.textContent = confVal.toFixed(1) + "%";
        }
        if (confidenceBar) {
            confidenceBar.style.width = Math.min(confVal, 100) + "%";
            confidenceBar.style.backgroundColor = mConfig.color;
        }
        if (moistureNote) {
            moistureNote.textContent = mConfig.note;
        }

        // Pillar 2: Soil Type
        if (soilTypeChip) soilTypeChip.textContent = soilType;
        if (soilTypeDesc) soilTypeDesc.textContent = soilTypeDescText;

        // Pillar 3: Soil Health
        if (healthStatusChip) {
            healthStatusChip.textContent = soilHealth + " Quality";
            healthStatusChip.className = "health-chip chip-health-" + soilHealth.toLowerCase();
        }
        if (healthSummaryText) healthSummaryText.textContent = healthSummary;

        // Visual Indicators List
        if (indicatorsList) {
            indicatorsList.innerHTML = "";
            if (indicators.length > 0) {
                indicators.forEach(item => {
                    const li = document.createElement("li");
                    li.innerHTML = `<span class="indicator-bullet">✓</span> <span>${item}</span>`;
                    indicatorsList.appendChild(li);
                });
            } else {
                indicatorsList.innerHTML = "<li><span>Visual texture and color balance inspected with AI.</span></li>";
            }
        }

        // Recommended Crops Chips
        if (cropChipsContainer) {
            cropChipsContainer.innerHTML = "";
            const cropIcons = {
                "wheat": "🌾", "paddy": "🌾", "rice": "🌾",
                "cotton": "☁️", "sugarcane": "🎋", "maize": "🌽", "corn": "🌽",
                "tomato": "🍅", "potato": "🥔", "groundnut": "🥜", "peanuts": "🥜",
                "soybean": "🌱", "soybeans": "🌱", "pulses": "🫘", "millets": "🌾",
                "mustard": "🌼", "tobacco": "🍃", "vegetables": "🥬", "carrots": "🥕",
                "barley": "🌾", "chili": "🌶️", "watermelon": "🍉"
            };

            if (recommendedCrops && recommendedCrops.length > 0) {
                recommendedCrops.forEach(crop => {
                    const clean = crop.trim();
                    const lower = clean.toLowerCase();
                    const icon = cropIcons[lower] || "🌱";
                    const span = document.createElement("span");
                    span.className = "crop-chip";
                    span.innerHTML = `<span class="crop-icon">${icon}</span> <strong>${clean}</strong>`;
                    cropChipsContainer.appendChild(span);
                });
            } else {
                cropChipsContainer.innerHTML = "<span class='crop-chip'>🌱 Suitable for seasonal local staples</span>";
            }
        }

        // Irrigation Guidance & Soil Amendments
        if (adviceTitle) {
            adviceTitle.textContent = moistureStr === "dry" ? "⚠️ Urgent Irrigation Action" :
                                     (moistureStr === "wet" ? "💧 Drainage & Aeration Action" : "✅ Irrigation Schedule");
        }
        if (adviceText) adviceText.textContent = irrigationAction;
        if (amendmentText) amendmentText.textContent = soilAmendments;

        // Display results block
        result.style.display = "block";

        // Save to farmer profile history
        if (typeof saveAnalysisRecord === "function") {
            saveAnalysisRecord({
                status: moistureStr,
                confidence: confVal,
                advice: irrigationAction,
                soil_type: soilType,
                soil_health: soilHealth,
                health_score: healthScore,
                crop_recommendations: recommendedCrops,
                soil_amendments: soilAmendments,
                ai_engine: aiEngine
            });
        }

        // Smooth scroll into view
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
});