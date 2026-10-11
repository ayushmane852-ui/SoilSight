// ============================================================
// SoilSight Augmented Reality (AR) & Precision Soil Diagnostic Engine
// Features: Google Lens-style live AR soil detection, camera viewfinder,
// real-time floating AR HUD card, shutter capture, and multi-pillar diagnostics.
// ============================================================

document.addEventListener("DOMContentLoaded", function () {
    const API_BASE = window.location.origin.includes(":5000") ? "" : "http://127.0.0.1:5000";

    // ---------------------------------------------------------
    // DOM Element References
    // ---------------------------------------------------------
    // Mode Switcher Tabs
    const tabArCamera = document.getElementById("tabArCamera");
    const tabUpload = document.getElementById("tabUpload");
    const arCameraSection = document.getElementById("arCameraSection");
    const uploadSection = document.getElementById("uploadSection");
    const uploadToCameraBtn = document.getElementById("uploadToCameraBtn");
    const switchToUploadBtn = document.getElementById("switchToUploadBtn");

    // Camera Viewfinder & AR HUD Elements
    const arVideo = document.getElementById("arVideo");
    const arCanvas = document.getElementById("arCanvas");
    const arViewfinder = document.getElementById("arViewfinder");
    const arStatusBadge = document.getElementById("arStatusBadge");
    const arStatusText = document.getElementById("arStatusText");
    const flipCameraBtn = document.getElementById("flipCameraBtn");
    const toggleTorchBtn = document.getElementById("toggleTorchBtn");
    const pauseArBtn = document.getElementById("pauseArBtn");
    const pauseArBtnText = document.getElementById("pauseArBtnText");
    const arReticle = document.getElementById("arReticle");
    const arScanLaser = document.getElementById("arScanLaser");
    const arShutterFlash = document.getElementById("arShutterFlash");
    const arCaptureBtn = document.getElementById("arCaptureBtn");

    // Google Lens Floating AR Overlay Elements
    const arLensOverlay = document.getElementById("arLensOverlay");
    const arSoilType = document.getElementById("arSoilType");
    const arMoistureTag = document.getElementById("arMoistureTag");
    const arConfidenceVal = document.getElementById("arConfidenceVal");
    const arHealthScoreVal = document.getElementById("arHealthScoreVal");
    const arHealthStatusVal = document.getElementById("arHealthStatusVal");
    const arGuidanceText = document.getElementById("arGuidanceText");
    const arIndicatorsRow = document.getElementById("arIndicatorsRow");
    const arSearchingPill = document.getElementById("arSearchingPill");
    const arSearchingText = document.getElementById("arSearchingText");

    // Camera Fallback & Sample Simulator Elements
    const arCameraFallback = document.getElementById("arCameraFallback");
    const arFallbackMsg = document.getElementById("arFallbackMsg");
    const retryCameraBtn = document.getElementById("retryCameraBtn");
    const testSampleSoilBtn = document.getElementById("testSampleSoilBtn");
    const testSoilSamplesBtn = document.getElementById("testSoilSamplesBtn");
    const fallbackUploadBtn = document.getElementById("fallbackUploadBtn");

    // Upload & Shared Preview Elements
    const imageInput = document.getElementById("imageInput");
    const dropzone = document.getElementById("dropzone");
    const uploadNotice = document.getElementById("uploadNotice");
    const uploadNoticeText = document.getElementById("uploadNoticeText");
    const uploadPreviewCard = document.getElementById("uploadPreviewCard");
    const uploadPreviewImg = document.getElementById("uploadPreviewImg");
    const uploadFileTag = document.getElementById("uploadFileTag");
    const changeUploadedPhotoBtn = document.getElementById("changeUploadedPhotoBtn");
    const previewContainer = document.getElementById("previewContainer");
    const preview = document.getElementById("preview");
    const previewSourceTag = document.getElementById("previewSourceTag");
    const changeImageBtn = document.getElementById("changeImageBtn");
    const returnToArBtn = document.getElementById("returnToArBtn");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const loading = document.getElementById("loading");
    const result = document.getElementById("result");
    const resetBtn = document.getElementById("resetBtn");
    const reopenArBtn = document.getElementById("reopenArBtn");

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

    // Farmer Profile Nav
    const farmerPill = document.getElementById("farmerPill");
    const farmerNameNav = document.getElementById("farmerNameNav");

    // ---------------------------------------------------------
    // Application State
    // ---------------------------------------------------------
    let currentMode = "camera"; // 'camera' or 'upload'
    let mediaStream = null;
    let currentFacingMode = "environment"; // default to rear camera for mobile field work
    let videoTrack = null;
    let isTorchOn = false;
    let isScanPaused = false;
    let arScanInterval = null;
    let isScanningRequestActive = false;
    let currentSelectedFile = null;
    let isSimulatorActive = false;
    let simulatorSoilIndex = 0;
    let simulatorTimer = null;

    // Available Sample Soils for Simulator / Offline Testing
    const sampleSoilFeeds = [
        {
            name: "Moderate Loamy Soil",
            url: "assets/sample_moderate_soil.jpg",
            desc: "Natural field loam with optimal moisture"
        },
        {
            name: "Dry Sandy Loam",
            url: "assets/sample_dry_soil.jpg",
            desc: "Porous low-moisture field soil"
        },
        {
            name: "Wet Heavy Soil",
            url: "assets/sample_wet_soil.jpg",
            desc: "High-saturation dark soil sample"
        }
    ];

    // Display logged in farmer if available
    const currentFarmer = typeof getCurrentFarmer === "function" ? getCurrentFarmer() : null;
    if (currentFarmer && farmerPill && farmerNameNav) {
        farmerNameNav.textContent = currentFarmer.name;
        farmerPill.style.display = "inline-flex";
    }

    // Check Gemini API Configuration Status
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

    // ---------------------------------------------------------
    // Web Audio Synthesizer for Camera Shutter Sound
    // ---------------------------------------------------------
    function playCameraShutterSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            // Subtle click sound
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.09);
        } catch (e) {
            // Audio context policy or disabled
        }
    }

    // ---------------------------------------------------------
    // Tab Mode Switcher Logic
    // ---------------------------------------------------------
    function setMode(mode) {
        currentMode = mode;
        if (mode === "camera") {
            tabArCamera.classList.add("active");
            tabUpload.classList.remove("active");
            arCameraSection.style.display = "block";
            uploadSection.style.display = "none";
            if (previewContainer) previewContainer.style.display = "none";
            if (result) result.style.display = "none";
            startArCamera();
        } else {
            tabArCamera.classList.remove("active");
            tabUpload.classList.add("active");
            arCameraSection.style.display = "none";
            uploadSection.style.display = "block";
            if (previewContainer) previewContainer.style.display = "none";
            if (result) result.style.display = "none";
            if (uploadNotice) uploadNotice.style.display = "none";

            // If a file was already selected, show preview; else show dropzone
            if (currentSelectedFile) {
                if (dropzone) dropzone.style.display = "none";
                if (uploadPreviewCard) uploadPreviewCard.style.display = "block";
            } else {
                if (dropzone) dropzone.style.display = "block";
                if (uploadPreviewCard) uploadPreviewCard.style.display = "none";
            }
            stopArCamera();
        }
    }

    if (tabArCamera) tabArCamera.addEventListener("click", () => setMode("camera"));
    if (tabUpload) tabUpload.addEventListener("click", () => setMode("upload"));
    if (uploadToCameraBtn) uploadToCameraBtn.addEventListener("click", () => setMode("camera"));
    if (switchToUploadBtn) switchToUploadBtn.addEventListener("click", () => setMode("upload"));
    if (fallbackUploadBtn) fallbackUploadBtn.addEventListener("click", () => setMode("upload"));

    // ---------------------------------------------------------
    // AR Camera Lifecycle & Controls
    // ---------------------------------------------------------
    async function startArCamera() {
        stopSimulator();
        if (arCameraFallback) arCameraFallback.style.display = "none";

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showCameraFallback("Your browser does not support live camera access. You can use the Interactive Sample Soil Simulator or upload photos.");
            return;
        }

        try {
            // Stop any existing stream
            stopMediaStream();

            const constraints = {
                video: {
                    facingMode: { ideal: currentFacingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            arVideo.srcObject = mediaStream;

            videoTrack = mediaStream.getVideoTracks()[0];
            checkTorchSupport();

            arVideo.onloadedmetadata = () => {
                arVideo.play().catch(e => console.log("Video play note:", e));
                updateArStatusBadge("AR LENS ACTIVE • SCANNING", "#2e7d32");
                startContinuousArScanning();
            };

        } catch (err) {
            console.warn("Camera access failed or denied:", err);
            showCameraFallback("Camera access was denied or no camera device is connected. Use the interactive soil simulator or upload a photo.");
        }
    }

    function stopMediaStream() {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
            videoTrack = null;
        }
        if (arVideo) {
            arVideo.srcObject = null;
        }
    }

    function stopArCamera() {
        stopMediaStream();
        stopContinuousArScanning();
        stopSimulator();
    }

    function showCameraFallback(msg) {
        if (arCameraFallback) {
            arCameraFallback.style.display = "flex";
            if (arFallbackMsg) arFallbackMsg.textContent = msg;
        }
        if (arLensOverlay) arLensOverlay.style.display = "none";
        if (arSearchingPill) arSearchingPill.style.display = "none";
        stopContinuousArScanning();
    }

    if (retryCameraBtn) {
        retryCameraBtn.addEventListener("click", () => startArCamera());
    }

    // Camera Flip (Switch rear <-> front)
    if (flipCameraBtn) {
        flipCameraBtn.addEventListener("click", () => {
            currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
            startArCamera();
        });
    }

    // Torch / Flashlight Toggle
    function checkTorchSupport() {
        if (!videoTrack || !videoTrack.getCapabilities) {
            if (toggleTorchBtn) toggleTorchBtn.style.display = "none";
            return;
        }
        const capabilities = videoTrack.getCapabilities();
        if (capabilities.torch && toggleTorchBtn) {
            toggleTorchBtn.style.display = "inline-flex";
        } else if (toggleTorchBtn) {
            toggleTorchBtn.style.display = "none";
        }
    }

    if (toggleTorchBtn) {
        toggleTorchBtn.addEventListener("click", async () => {
            if (!videoTrack) return;
            try {
                isTorchOn = !isTorchOn;
                await videoTrack.applyConstraints({
                    advanced: [{ torch: isTorchOn }]
                });
                toggleTorchBtn.classList.toggle("torch-active", isTorchOn);
                toggleTorchBtn.innerHTML = isTorchOn ? "<span>⚡ Torch ON</span>" : "<span>⚡ Torch</span>";
            } catch (e) {
                console.log("Torch error:", e);
            }
        });
    }

    // Pause / Resume Scanning
    if (pauseArBtn) {
        pauseArBtn.addEventListener("click", () => {
            isScanPaused = !isScanPaused;
            if (isScanPaused) {
                if (pauseArBtnText) pauseArBtnText.textContent = "▶️ Resume Scan";
                pauseArBtn.classList.add("ar-btn-paused");
                if (arScanLaser) arScanLaser.style.animationPlayState = "paused";
                updateArStatusBadge("AR SCAN PAUSED", "#e65100");
            } else {
                if (pauseArBtnText) pauseArBtnText.textContent = "⏸️ Pause Scan";
                pauseArBtn.classList.remove("ar-btn-paused");
                if (arScanLaser) arScanLaser.style.animationPlayState = "running";
                updateArStatusBadge("AR LENS ACTIVE • SCANNING", "#2e7d32");
            }
        });
    }

    function updateArStatusBadge(text, color) {
        if (arStatusText) arStatusText.textContent = text;
        if (arStatusBadge) {
            arStatusBadge.style.borderColor = color || "#2e7d32";
        }
    }

    // ---------------------------------------------------------
    // Real-Time Google Lens AR Soil Scanning Loop
    // ---------------------------------------------------------
    function startContinuousArScanning() {
        stopContinuousArScanning();
        // Run scan every 950ms for near-instant responsive feedback
        arScanInterval = setInterval(performArFrameScan, 950);
    }

    function stopContinuousArScanning() {
        if (arScanInterval) {
            clearInterval(arScanInterval);
            arScanInterval = null;
        }
    }

    async function performArFrameScan() {
        if (currentMode !== "camera" || isScanPaused || isScanningRequestActive) {
            return;
        }

        // Validate video source or simulator
        const hasVideo = arVideo && arVideo.readyState >= 2 && arVideo.videoWidth > 0;
        if (!hasVideo && !isSimulatorActive) {
            return;
        }

        try {
            isScanningRequestActive = true;

            // Offscreen canvas (224x224 for maximum inference speed)
            const canvas = arCanvas || document.createElement("canvas");
            canvas.width = 224;
            canvas.height = 224;
            const ctx = canvas.getContext("2d");

            if (isSimulatorActive && window.simulatorCurrentImg) {
                ctx.drawImage(window.simulatorCurrentImg, 0, 0, 224, 224);
            } else {
                // Center-crop video frame into square
                const vw = arVideo.videoWidth;
                const vh = arVideo.videoHeight;
                const cropSize = Math.min(vw, vh);
                const sx = (vw - cropSize) / 2;
                const sy = (vh - cropSize) / 2;
                ctx.drawImage(arVideo, sx, sy, cropSize, cropSize, 0, 0, 224, 224);
            }

            // Quick client-side check to skip completely dark frames
            const imgData = ctx.getImageData(0, 0, 40, 40).data;
            let sumLum = 0;
            for (let i = 0; i < imgData.length; i += 4) {
                sumLum += (imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3;
            }
            const avgLum = sumLum / (imgData.length / 4);
            if (avgLum < 12) {
                renderSearchingState("Camera obscured. Align with field soil sample.");
                isScanningRequestActive = false;
                return;
            }

            // Convert to lightweight JPEG data
            const dataUrl = canvas.toDataURL("image/jpeg", 0.75);

            // Send to ultra-fast /api/ar-scan endpoint
            const response = await fetch(`${API_BASE}/api/ar-scan`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: dataUrl })
            });

            if (!response.ok) {
                throw new Error("Scan response not OK");
            }

            const data = await response.json();
            handleArScanResult(data);

        } catch (err) {
            // Network hiccup or server warm up - keep graceful
            console.log("AR frame scan note:", err.message);
        } finally {
            isScanningRequestActive = false;
        }
    }

    // ---------------------------------------------------------
    // Google Lens AR Overlay Dynamic Rendering
    // ---------------------------------------------------------
    function handleArScanResult(data) {
        if (!data || !data.soil_detected) {
            renderSearchingState(data && data.message ? data.message : "Point camera at field soil...");
            return;
        }

        // Soil is detected! Display the Google Lens floating AR overlay!
        if (arSearchingPill) arSearchingPill.style.display = "none";
        if (arLensOverlay) {
            arLensOverlay.style.display = "flex";
            arLensOverlay.classList.add("ar-lens-detected");
        }

        // Soil Type
        if (arSoilType) {
            arSoilType.textContent = data.soil_type || "Loamy Soil";
        }

        // Moisture Badge & Accent Color
        const statusStr = (data.status || "moderate").toLowerCase();
        const accentColor = data.accent_color || (statusStr === "dry" ? "#e65100" : (statusStr === "wet" ? "#0277bd" : "#2e7d32"));

        if (arMoistureTag) {
            arMoistureTag.textContent = data.status_label || (statusStr.toUpperCase() + " MOISTURE");
            arMoistureTag.className = "ar-lens-moisture-tag tag-" + statusStr;
            arMoistureTag.style.backgroundColor = accentColor;
        }

        // Metrics
        if (arConfidenceVal) {
            arConfidenceVal.textContent = (data.confidence || 95).toFixed(1) + "%";
        }
        if (arHealthScoreVal) {
            arHealthScoreVal.textContent = (data.health_score || 85) + " / 100";
        }
        if (arHealthStatusVal) {
            arHealthStatusVal.textContent = data.soil_health || "Good";
            arHealthStatusVal.style.color = accentColor;
        }

        // Quick Agronomic Guidance
        if (arGuidanceText) {
            arGuidanceText.textContent = data.quick_advice || "Optimal root moisture conditions detected.";
        }

        // Detected Indicators Chips
        if (arIndicatorsRow && data.indicators) {
            arIndicatorsRow.innerHTML = "";
            data.indicators.slice(0, 2).forEach(ind => {
                const span = document.createElement("span");
                span.className = "ar-chip";
                span.innerHTML = `✓ ${ind}`;
                arIndicatorsRow.appendChild(span);
            });
        }

        // Reticle Corner Accent Color
        if (arReticle) {
            arReticle.style.setProperty("--ar-accent", accentColor);
        }

        // Update Top Status Badge
        updateArStatusBadge(`🎯 ${data.soil_type.toUpperCase()} • ${data.status.toUpperCase()}`, accentColor);
    }

    function renderSearchingState(msg) {
        if (arLensOverlay) arLensOverlay.style.display = "none";
        if (arSearchingPill) {
            arSearchingPill.style.display = "inline-flex";
            if (arSearchingText) arSearchingText.textContent = msg || "Align camera directly with soil...";
        }
        if (arReticle) {
            arReticle.style.setProperty("--ar-accent", "#4caf50");
        }
        updateArStatusBadge("AR LENS ACTIVE • SCANNING", "#4caf50");
    }

    // ---------------------------------------------------------
    // Interactive Sample Soil Simulator (For Desktop & Demos)
    // ---------------------------------------------------------
    function startSimulator(index = 0) {
        isSimulatorActive = true;
        stopMediaStream();
        if (arCameraFallback) arCameraFallback.style.display = "none";

        simulatorSoilIndex = index % sampleSoilFeeds.length;
        const currentSample = sampleSoilFeeds[simulatorSoilIndex];

        // Draw image onto video area via canvas simulation
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = currentSample.url;
        img.onload = () => {
            window.simulatorCurrentImg = img;
            // Create offscreen video replacement
            drawSimulatorFrame();
            updateArStatusBadge(`SIMULATION FEED: ${currentSample.name.toUpperCase()}`, "#2e7d32");
            startContinuousArScanning();
        };

        if (arSearchingPill) arSearchingPill.style.display = "none";
    }

    function drawSimulatorFrame() {
        if (!isSimulatorActive || !window.simulatorCurrentImg) return;
        // Make canvas visible or draw onto viewfinder canvas
        if (arVideo) {
            arVideo.style.display = "none";
        }
        let simCanvas = document.getElementById("simDisplayCanvas");
        if (!simCanvas) {
            simCanvas = document.createElement("canvas");
            simCanvas.id = "simDisplayCanvas";
            simCanvas.className = "sim-display-canvas";
            arViewfinder.insertBefore(simCanvas, arReticle);
        }
        simCanvas.style.display = "block";
        simCanvas.width = 800;
        simCanvas.height = 800;
        const ctx = simCanvas.getContext("2d");
        ctx.drawImage(window.simulatorCurrentImg, 0, 0, 800, 800);
    }

    function stopSimulator() {
        isSimulatorActive = false;
        window.simulatorCurrentImg = null;
        if (simulatorTimer) {
            clearInterval(simulatorTimer);
            simulatorTimer = null;
        }
        const simCanvas = document.getElementById("simDisplayCanvas");
        if (simCanvas) simCanvas.style.display = "none";
        if (arVideo) arVideo.style.display = "block";
    }

    if (testSampleSoilBtn) {
        testSampleSoilBtn.addEventListener("click", () => {
            startSimulator(0);
        });
    }

    if (testSoilSamplesBtn) {
        testSoilSamplesBtn.addEventListener("click", () => {
            simulatorSoilIndex = (simulatorSoilIndex + 1) % sampleSoilFeeds.length;
            startSimulator(simulatorSoilIndex);
        });
    }

    // ---------------------------------------------------------
    // Capture Shutter Button (Snapshot + Full Diagnostic Report)
    // ---------------------------------------------------------
    if (arCaptureBtn) {
        arCaptureBtn.addEventListener("click", async () => {
            // 1. Shutter sound and flash effect
            playCameraShutterSound();
            if (arShutterFlash) {
                arShutterFlash.classList.add("flash-active");
                setTimeout(() => arShutterFlash.classList.remove("flash-active"), 220);
            }

            // 2. Capture high-res frame
            const snapCanvas = document.createElement("canvas");
            let srcWidth = 800;
            let srcHeight = 800;

            if (isSimulatorActive && window.simulatorCurrentImg) {
                srcWidth = window.simulatorCurrentImg.naturalWidth || 800;
                srcHeight = window.simulatorCurrentImg.naturalHeight || 800;
                snapCanvas.width = srcWidth;
                snapCanvas.height = srcHeight;
                snapCanvas.getContext("2d").drawImage(window.simulatorCurrentImg, 0, 0);
            } else if (arVideo && arVideo.videoWidth > 0) {
                srcWidth = arVideo.videoWidth;
                srcHeight = arVideo.videoHeight;
                snapCanvas.width = srcWidth;
                snapCanvas.height = srcHeight;
                snapCanvas.getContext("2d").drawImage(arVideo, 0, 0, srcWidth, srcHeight);
            } else {
                alert("Please ensure live soil is inside camera view.");
                return;
            }

            // 3. Convert snapshot to Blob
            snapCanvas.toBlob(async (blob) => {
                if (!blob) {
                    alert("Could not capture frame. Please try again.");
                    return;
                }

                currentSelectedFile = blob;
                const capturedUrl = URL.createObjectURL(blob);
                preview.src = capturedUrl;
                if (previewSourceTag) {
                    previewSourceTag.textContent = isSimulatorActive ? "🧪 Simulated Field Sample Snapshot" : "📸 AR Camera Snapshot";
                }

                // Transition UI to preview & loading
                arCameraSection.style.display = "none";
                uploadSection.style.display = "none";
                previewContainer.style.display = "block";
                loading.style.display = "flex";
                if (result) result.style.display = "none";

                // Stop live camera scanning during full analysis
                stopContinuousArScanning();

                // 4. Submit to full /predict diagnostic endpoint
                await executeSoilPrediction(blob);

            }, "image/jpeg", 0.95);
        });
    }

    // Return to AR camera button from preview or result
    function returnToLiveCamera() {
        if (previewContainer) previewContainer.style.display = "none";
        if (result) result.style.display = "none";
        setMode("camera");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (returnToArBtn) returnToArBtn.addEventListener("click", returnToLiveCamera);
    if (reopenArBtn) reopenArBtn.addEventListener("click", returnToLiveCamera);

    // ---------------------------------------------------------
    // Image Selection & Dropzone Interactions (Upload Mode)
    // ---------------------------------------------------------
    function handleFileSelected(file) {
        if (!file || !file.type.startsWith("image/")) {
            showUploadNotice("⚠️ Please select a valid image file (JPG, PNG, or WEBP).");
            return;
        }

        currentSelectedFile = file;
        const imageURL = URL.createObjectURL(file);

        // Update preview image inside uploadSection
        if (uploadPreviewImg) uploadPreviewImg.src = imageURL;
        if (uploadFileTag) uploadFileTag.textContent = file.name ? ("📁 " + file.name) : "📁 Selected Soil Sample";

        // CRITICAL: Keep uploadSection visible! Hide dropzone, show preview card
        if (dropzone) dropzone.style.display = "none";
        if (uploadPreviewCard) uploadPreviewCard.style.display = "block";
        if (uploadNotice) uploadNotice.style.display = "none";
        if (result) result.style.display = "none";
        if (previewContainer) previewContainer.style.display = "none";

        // Ensure analyze button is prominent, active, and pulsing
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.classList.add("pulse-btn");
        }
    }

    function showUploadNotice(msg) {
        if (uploadNotice) {
            if (uploadNoticeText) uploadNoticeText.textContent = msg;
            uploadNotice.style.display = "flex";
            uploadNotice.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
            alert(msg);
        }
    }

    function resetUploadSelection() {
        if (imageInput) imageInput.value = "";
        currentSelectedFile = null;
        if (uploadPreviewImg) uploadPreviewImg.src = "";
        if (uploadPreviewCard) uploadPreviewCard.style.display = "none";
        if (dropzone) dropzone.style.display = "block";
        if (uploadNotice) uploadNotice.style.display = "none";
        if (result) result.style.display = "none";
        if (analyzeBtn) analyzeBtn.classList.remove("pulse-btn");
    }

    if (changeUploadedPhotoBtn) {
        changeUploadedPhotoBtn.addEventListener("click", resetUploadSelection);
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
            resetUploadSelection();
            setMode("upload");
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
            resetUploadSelection();
            setMode("camera");
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // Upload Mode: Manual analyze button
    if (analyzeBtn) {
        analyzeBtn.addEventListener("click", async function (e) {
            e.preventDefault();
            // CRITICAL: If no image is selected, SHOW "First upload image" and DO NOT predict!
            if (!currentSelectedFile) {
                showUploadNotice("⚠️ Please select or upload a soil image first before running the diagnostic.");
                if (dropzone) {
                    dropzone.classList.add("dropzone-highlight-error");
                    setTimeout(() => dropzone.classList.remove("dropzone-highlight-error"), 2500);
                    dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
                }
                // Never show prediction result when no image is uploaded
                if (result) result.style.display = "none";
                return;
            }

            if (uploadNotice) uploadNotice.style.display = "none";
            loading.style.display = "flex";
            if (result) result.style.display = "none";
            analyzeBtn.disabled = true;

            try {
                await executeSoilPrediction(currentSelectedFile);
            } finally {
                analyzeBtn.disabled = false;
            }
        });
    }

    // ---------------------------------------------------------
    // Full Soil Diagnostic Execution (/predict)
    // ---------------------------------------------------------
    async function executeSoilPrediction(fileOrBlob) {
        loading.style.display = "flex";
        if (result) result.style.display = "none";

        const formData = new FormData();
        formData.append("image", fileOrBlob, "soil_sample.jpg");
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
                // Backend validation error (e.g. non-soil rejected or missing image)
                throw new Error(data.error || "Soil diagnostic failed. Check backend server.");
            }

            renderDiagnosticReport(data);

        } catch (error) {
            console.error("Analysis error:", error);
            // CRITICAL: If prediction failed or image is not soil, result NEVER displays!
            if (result) result.style.display = "none";
            showUploadNotice("⚠️ " + error.message);
            alert("⚠️ Diagnostic Notice:\n\n" + error.message);
        } finally {
            loading.style.display = "none";
        }
    }

    // ---------------------------------------------------------
    // Render Complete Diagnostic Report
    // ---------------------------------------------------------
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

    // ---------------------------------------------------------
    // Initialize Camera on Page Load
    // ---------------------------------------------------------
    setMode("camera");
});