const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const satellite = require('satellite.js');
const SunCalc = require('suncalc'); 

const AXIOS_TIMEOUT = 15000;
let latestData = {};
let tleLine1 = null, tleLine2 = null;
const HIROSHIMA_LAT = 34.3852;
const HIROSHIMA_LNG = 132.4553;

const app = express();
app.use(express.static(path.join(__dirname)));
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`✅ ISS トラッキングサーバーがポート${PORT}で起動`));
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
    console.log('🔗 クライアント接続');
    if (Object.keys(latestData).length > 0) {
        ws.send(JSON.stringify(latestData));
    }
    ws.on('close', () => console.log('🔌 クライアント切断'));
});

async function fetchIssRealtimeData() {
    try {
        const url = 'https://api.wheretheiss.at/v1/satellites/25544';
        const response = await axios.get(url, { timeout: AXIOS_TIMEOUT });
        return {
            lat: response.data.latitude,
            lng: response.data.longitude,
            altitude: response.data.altitude,
            velocity: response.data.velocity
        };
    } catch (e) {
        console.error("❌ リアルタイム位置取得失敗:", e.message);
        return { error: true };
    }
}

function calculateOrbitalData() {
    if (!tleLine1 || !tleLine2) {
        return { orbitPoints: [] };
    }
    try {
        const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
        const now = new Date();
        const orbitPoints = [];
        for (let i = -90; i <= 90; i++) {
            const time = new Date(now.getTime() + i * 60000);
            const posVel = satellite.propagate(satrec, time);
            if (posVel.position) {
                const gmst = satellite.gstime(time);
                const posGd = satellite.eciToGeodetic(posVel.position, gmst);
                orbitPoints.push([satellite.degreesLat(posGd.latitude), satellite.degreesLong(posGd.longitude)]);
            }
        }
        return { orbitPoints };
    } catch (error) {
        console.error("❌ 軌道計算エラー:", error.message);
        return { orbitPoints: [] };
    }
}

async function updateTle() {
    try {
        const url = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle';
        const response = await axios.get(url, { timeout: AXIOS_TIMEOUT });
        const tle = response.data.split(/[\r\n]+/);
        if (tle.length >= 3) {
            tleLine1 = tle[1];
            tleLine2 = tle[2];
            console.log('🛰️ TLEデータを更新しました');
        } else {
            console.error('❌ TLEデータの形式が不正です。');
        }
    } catch (e) {
        console.error("❌ TLEデータの取得に失敗:", e.message);
    }
}

function calculateAdditionalData(lat, lng, altitude) {
    if (!tleLine1 || !tleLine2) return {};
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const now = new Date();
    
    const sunPos = SunCalc.getPosition(now, lat, lng);
    const daylight = sunPos.altitude > -0.10472 ? 'Daylight' : 'Night';
    const visibility = satrec.islight ? 'Visible' : 'Not Visible';

    const inclinationRad = satrec.inclo;
    const inclinationDeg = satellite.degreesLong(inclinationRad);

    const periodMin = 1440 / satrec.no;

    return {
        daylight,
        visibility,
        inclination: inclinationDeg,
        period: periodMin,
    };
}

async function broadcastData() {
    const [realtimeData, orbitalData] = await Promise.all([
        fetchIssRealtimeData(),
        calculateOrbitalData()
    ]);
    if (realtimeData.error) {
        console.error("❌ リアルタイムデータが取得できないため、ブロードキャストをスキップします。");
        return;
    }
    const additionalData = calculateAdditionalData(realtimeData.lat, realtimeData.lng, realtimeData.altitude);
    latestData = {
        iss: {
            ...orbitalData,
            ...realtimeData,
            ...additionalData,
            crewCount: 7,
        }
    };
    const message = JSON.stringify(latestData);
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(message);
        }
    });
}

updateTle();
setInterval(updateTle, 6 * 60 * 60 * 1000);
setInterval(broadcastData, 2000);