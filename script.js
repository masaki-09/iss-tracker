// ========== マップ初期化 ==========
const issMap = L.map('map-iss', { center: [0, 0], zoom: 2, zoomControl: true, attributionControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>', opacity: 0.7 }).addTo(issMap);

const issEmojiIcon = L.divIcon({
    html: '🛰️',
    className: 'iss-emoji-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});
let issMarker = L.marker([0, 0], { icon: issEmojiIcon }).addTo(issMap);

let issOrbitGroup = L.layerGroup().addTo(issMap);
let isFirstUpdate = true;

// ========== DOM要素 ==========
const elements = {
    lat: document.getElementById('iss-latitude'),
    lng: document.getElementById('iss-longitude'),
    alt: document.getElementById('iss-altitude'),
    vel: document.getElementById('iss-velocity'),
    crewCount: document.getElementById('iss-crew-count'),
    daylight: document.getElementById('iss-daylight'),
    visibility: document.getElementById('iss-visibility'),
    inclination: document.getElementById('iss-inclination'),
    utcTime: document.getElementById('iss-utc-time'),
    jstTime: document.getElementById('iss-jst-time')
};

// ========== WebSocket接続 ==========
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}`);

ws.onopen = () => {
    console.log('✅ バックエンドに接続');
};
ws.onerror = (error) => {
    console.error("❌ WebSocket接続エラー:", error);
};

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        if (data.iss) {
            updateIssData(data.iss);
        }
    } catch (e) {
        console.error("❌ WebSocketデータ解析エラー:", e);
    }
};

function splitOrbit(points) {
    const segments = [];
    let currentSegment = [];
    if (points.length > 0) {
        currentSegment.push(points[0]);
        for (let i = 1; i < points.length; i++) {
            const prevLng = points[i - 1][1];
            const currentLng = points[i][1];
            if (Math.abs(currentLng - prevLng) > 180) {
                segments.push(currentSegment);
                currentSegment = [];
            }
            currentSegment.push(points[i]);
        }
        segments.push(currentSegment);
    }
    return segments;
}

function updateIssData(data) {
    if (data.lat && data.lng) {
        const { lat, lng, altitude, velocity } = data;
        issMarker.setLatLng([lat, lng]);
        issMap.panTo([lat, lng], { animate: true, duration: 2 });
        elements.lat.textContent = lat.toFixed(4) + '°';
        elements.lng.textContent = lng.toFixed(4) + '°';
        elements.alt.textContent = altitude.toFixed(2);
        elements.vel.textContent = velocity.toFixed(2);
        elements.crewCount.textContent = '7';
        elements.daylight.textContent = data.daylight;
        elements.visibility.textContent = data.visibility;
        elements.inclination.textContent = data.inclination.toFixed(2) + '°';

        if (isFirstUpdate) {
            issMap.setView([lat, lng], 3);
            isFirstUpdate = false;
        }
    }
    if (data.orbitPoints && data.orbitPoints.length > 0) {
        const orbitSegments = splitOrbit(data.orbitPoints);
        issOrbitGroup.clearLayers();
        orbitSegments.forEach(segment => {
            L.polyline(segment, { color: '#ff7800', weight: 2, opacity: 0.8 }).addTo(issOrbitGroup);
        });
    }
}

function updateTime() {
    const now = new Date();
    const utcTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' });
    const jstTime = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' });
    elements.utcTime.textContent = utcTime;
    elements.jstTime.textContent = jstTime;
}

setInterval(updateTime, 1000);