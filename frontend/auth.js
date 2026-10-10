/**
 * SoilSight Authentication & Profile Management
 * Provides user registration, login, session persistence, and analysis history.
 * Supports both Flask backend API and browser localStorage fallback.
 */

const API_BASE_URL = "http://127.0.0.1:5000/api";

const STORAGE_KEYS = {
    CURRENT_USER: "soilsight_current_user",
    USERS_LIST: "soilsight_registered_farmers",
    HISTORY_PREFIX: "soilsight_history_"
};

/**
 * Get current logged in farmer session
 */
function getCurrentFarmer() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error("Error reading farmer session:", e);
        return null;
    }
}

/**
 * Save current logged in farmer session
 */
function setCurrentFarmer(farmer) {
    if (!farmer) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } else {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(farmer));
    }
}

/**
 * Register a new farmer
 */
async function registerFarmer(data) {
    const { name, email, phone, location, farm_size, crops, password } = data;

    if (!name || !email || !password) {
        return { success: false, message: "Please provide your Name, Email/Phone, and Password." };
    }

    // Try backend API first
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        const resData = await response.json();

        if (response.ok && resData.user) {
            // Also mirror in localStorage
            saveFarmerLocally(resData.user, password);
            return { success: true, message: "Registration successful!", user: resData.user };
        } else if (!response.ok && resData.error) {
            return { success: false, message: resData.error };
        }
    } catch (err) {
        console.warn("Backend API unreachable, using local storage registration:", err);
    }

    // LocalStorage Fallback
    const localUsers = getLocalFarmers();
    const existing = localUsers.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (existing) {
        return { success: false, message: "An account with this email or mobile already exists. Please log in." };
    }

    const newFarmer = {
        id: "farmer_" + Date.now(),
        name,
        email: email.trim(),
        phone: phone || "",
        location: location || "Not specified",
        farm_size: farm_size || "1-5 Acres",
        crops: crops || "Mixed Crops",
        created_at: new Date().toISOString()
    };

    localUsers.push({ ...newFarmer, password });
    localStorage.setItem(STORAGE_KEYS.USERS_LIST, JSON.stringify(localUsers));

    return { success: true, message: "Account created successfully!", user: newFarmer };
}

/**
 * Log in farmer
 */
async function loginFarmer(identifier, password) {
    if (!identifier || !password) {
        return { success: false, message: "Please enter your email/phone and password." };
    }

    // Try backend API first
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: identifier, password })
        });

        const resData = await response.json();

        if (response.ok && resData.user) {
            setCurrentFarmer(resData.user);
            return { success: true, user: resData.user };
        } else if (!response.ok && resData.error) {
            return { success: false, message: resData.error };
        }
    } catch (err) {
        console.warn("Backend API unreachable, using local storage authentication:", err);
    }

    // LocalStorage Fallback
    const localUsers = getLocalFarmers();
    const found = localUsers.find(
        u => (u.email.toLowerCase() === identifier.toLowerCase() || u.phone === identifier) &&
             u.password === password
    );

    if (found) {
        const userSession = {
            id: found.id,
            name: found.name,
            email: found.email,
            phone: found.phone,
            location: found.location,
            farm_size: found.farm_size,
            crops: found.crops,
            created_at: found.created_at
        };
        setCurrentFarmer(userSession);
        return { success: true, user: userSession };
    }

    return { success: false, message: "Invalid email/phone or password. Please try again." };
}

/**
 * Log out current farmer
 */
function logoutFarmer() {
    setCurrentFarmer(null);
    window.location.href = "index.html";
}

/**
 * Protect pages that require farmer to be logged in
 */
function requireAuth(redirectUrl = "login.html") {
    const farmer = getCurrentFarmer();
    if (!farmer) {
        window.location.href = redirectUrl;
        return null;
    }
    return farmer;
}

/**
 * Save an analysis result to farmer history
 */
async function saveAnalysisRecord(record) {
    const farmer = getCurrentFarmer();
    const email = farmer ? farmer.email : "guest@soilsight.local";

    const payload = {
        email: email,
        status: record.status,
        confidence: record.confidence,
        advice: record.advice || "",
        soil_type: record.soil_type || "Loamy Soil",
        soil_health: record.soil_health || "Good",
        health_score: record.health_score || 85,
        crop_recommendations: record.crop_recommendations || "",
        soil_amendments: record.soil_amendments || "",
        ai_engine: record.ai_engine || "SoilSight AI",
        created_at: new Date().toISOString()
    };

    // Save to localStorage
    try {
        const historyKey = STORAGE_KEYS.HISTORY_PREFIX + email;
        const rawHistory = localStorage.getItem(historyKey);
        const history = rawHistory ? JSON.parse(rawHistory) : [];
        history.unshift(payload);
        localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 50)));
    } catch (e) {
        console.error("Error saving local history:", e);
    }

    // Save to Backend if available
    try {
        await fetch(`${API_BASE_URL}/save-history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        // silent fallback
    }
}

/**
 * Fetch analysis history for farmer
 */
async function getFarmerHistory(email) {
    if (!email) {
        const farmer = getCurrentFarmer();
        if (!farmer) return [];
        email = farmer.email;
    }

    // Try backend
    try {
        const response = await fetch(`${API_BASE_URL}/history?email=${encodeURIComponent(email)}`);
        if (response.ok) {
            const data = await response.json();
            if (data.history && data.history.length > 0) {
                return data.history;
            }
        }
    } catch (e) {
        // use local
    }

    // Local fallback
    try {
        const historyKey = STORAGE_KEYS.HISTORY_PREFIX + email;
        const raw = localStorage.getItem(historyKey);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Helper: get local farmer accounts
 */
function getLocalFarmers() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.USERS_LIST);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveFarmerLocally(farmer, password) {
    const list = getLocalFarmers();
    const index = list.findIndex(u => u.email.toLowerCase() === farmer.email.toLowerCase());
    const entry = { ...farmer, password };
    if (index >= 0) {
        list[index] = entry;
    } else {
        list.push(entry);
    }
    localStorage.setItem(STORAGE_KEYS.USERS_LIST, JSON.stringify(list));
}
