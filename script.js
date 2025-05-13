// --- 定数 ---
const BASE_FARE = 750;        // 初乗り料金（円）
const BASE_DIST = 1200;       // 初乗距離（m）
const UNIT_DIST = 293;        // 加算単位距離（m）
const UNIT_FARE = 100;        // 加算料金（円）
const WAIT_THRESHOLD = 10;    // 時速10km/h以下を待機と判定
const WAIT_INTERVAL = 115;    // 1分55秒 = 115秒ごとに加算
const NIGHT_FACTOR = 1.2;     // 深夜割増率
const NIGHT_START = 22;       // 22時～
const NIGHT_END = 5;          // ～5時

// --- UI 要素 ---
const statusIndicator = document.getElementById('statusIndicator');
const fareEl = document.getElementById('fare');
const btnIdle = document.getElementById('btnIdle');
const btnActive = document.getElementById('btnActive');
const btnPay = document.getElementById('btnPay');

let watchId = null;
let state = 'idle';       // 'idle' | 'active' | 'paid'
let prevPos = null;
let totalDist = 0;        // m
let waitTime = 0;         // s
let lastTimestamp = null;
let currentFare = BASE_FARE;
let tripStart = null;

// --- ヘルパー ---
function haversine(lat1, lon1, lat2, lon2) {
  const R=6371000;
  const toRad = a=>a*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function isNight(date=new Date()){
  const h = date.getHours();
  return (h>=NIGHT_START)|| (h< NIGHT_END);
}

// --- 計算／表示更新 ---
function updateMeter(position) {
  const { latitude, longitude, speed } = position.coords;
  const now = position.timestamp;
  if (prevPos) {
    // 距離計算
    const d = haversine(prevPos.lat, prevPos.lon, latitude, longitude);
    totalDist += d;

    // 時間計算（秒）
    const dt = (now - lastTimestamp) / 1000;
    const kmh = speed!==null ? speed*3.6 : (d/dt)*3.6;
    if (kmh <= WAIT_THRESHOLD) waitTime += dt;

    // 距離加算運賃
    const extraDist = Math.max(0, totalDist - BASE_DIST);
    const units = Math.floor(extraDist / UNIT_DIST);
    const distFare = units * UNIT_FARE;

    // 待機加算運賃
    const waitUnits = Math.floor(waitTime / WAIT_INTERVAL);
    const waitFare = waitUnits * UNIT_FARE;

    // 合計
    let fare = BASE_FARE + distFare + waitFare;
    if (isNight()) fare = Math.ceil(fare * NIGHT_FACTOR);

    currentFare = fare;
    fareEl.textContent = fare.toLocaleString();
  }
  prevPos = { lat: latitude, lon: longitude };
  lastTimestamp = now;
}

// --- 状態遷移 ---
function toIdle(){
  state='idle';
  statusIndicator.textContent='空車';
  btnIdle.disabled=true;
  btnActive.disabled=false;
  btnPay.disabled=true;
  fareEl.textContent = '0';
  // リセット
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  prevPos = null;
  totalDist = 0;
  waitTime = 0;
  lastTimestamp = null;
}
function toActive(){
  state='active';
  tripStart = new Date();
  statusIndicator.textContent='実車';
  btnIdle.disabled=false;
  btnActive.disabled=true;
  btnPay.disabled=false;
  // Geolocation 開始
  watchId = navigator.geolocation.watchPosition(
    updateMeter,
    e=>console.error(e),
    { enableHighAccuracy:true, maximumAge:1000, timeout:5000 }
  );
}
function toPaid(){
  state='paid';
  statusIndicator.textContent='支払';
  btnIdle.disabled=false;
  btnActive.disabled=false;
  btnPay.disabled=true;
  // Geolocation 止める
  navigator.geolocation.clearWatch(watchId);
  // 履歴保存
  const trip = {
    start: tripStart.toISOString(),
    end: new Date().toISOString(),
    distance_m: Math.round(totalDist),
    wait_s: Math.floor(waitTime),
    fare: currentFare
  };
  const history = JSON.parse(localStorage.getItem('trips')||'[]');
  history.push(trip);
  localStorage.setItem('trips', JSON.stringify(history, null, 2));
  alert(`支払額：${currentFare.toLocaleString()}円\n履歴に保存しました`);
}

// --- イベント ---
btnIdle.addEventListener('click', toIdle);
btnActive.addEventListener('click', toActive);
btnPay.addEventListener('click', toPaid);

// 初期化
toIdle();
