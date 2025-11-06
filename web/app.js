// web/app.js (safe版)
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const resultText = document.getElementById("result");
const scanBtn = document.getElementById("scan");
const debugText = document.getElementById("debug");
const bar = document.getElementById("bar");

let Module = null;
let classifyImage = null;
let getLastScore = null;
let setInputShape = null;

let scanning = false;
let intervalId = null;
let wasmReady = false;

const MODEL_W = 96, MODEL_H = 96, MODEL_CH = 3;

function setStatus(msg) { resultText.textContent = msg; console.log(msg); }

async function initWasm() {
  try {
    setStatus("Result: 初始化 WASM 中…");
    // 來自 classify.js（需用 MODULARIZE=1, EXPORT_NAME=createModule 編譯）
    Module = await createModule();
    classifyImage = Module.cwrap("classify_image", "number", ["number","number","number","number"]);
    getLastScore  = Module.cwrap("get_last_score", "number", []);
    setInputShape = Module.cwrap("set_input_shape", null, ["number","number","number"]);
    setInputShape(MODEL_W, MODEL_H, MODEL_CH);
    wasmReady = true;
    setStatus("Result: WASM 就緒");
    scanBtn.disabled = false;               // 啟用按鈕
    scanBtn.textContent = "Start Scanning";
  } catch (e) {
    wasmReady = false;
    setStatus("Result: ❌ WASM 載入失敗（將只顯示 Avg）");
    console.error(e);
    scanBtn.disabled = false;               // 仍允許按，但只跑 Avg 顯示
    scanBtn.textContent = "Start (Avg only)";
  }
}

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    console.log("Camera ready");
  } catch (err) {
    setStatus("Result: ❌ Camera blocked: " + err.message);
    throw err;
  }
}

function grabFrameAndAvg() {
  if (!video || video.readyState < 2) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src = img.data;
  let sumLuma = 0;
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i], g = src[i+1], b = src[i+2];
    sumLuma += 0.2126*r + 0.7152*g + 0.0722*b;
  }
  const avg = sumLuma / (src.length / 4);
  return { img, avg };
}

function runOnce() {
  const data = grabFrameAndAvg();
  if (!data) return;
  const { img, avg } = data;

  // 先顯示 Avg，確保 UI 有動
  debugText.textContent = `Avg Brightness: ${avg.toFixed(1)}`;
  bar.style.width = `${Math.min(100, Math.max(0, Math.round((avg/255)*100)))}%`;

  // WASM 尚未就緒就直接返回（避免 HEAPU8.set 報錯）
  if (!wasmReady) return;

  // 準備 RGB buffer
  const src = img.data;
  const arr = new Uint8Array(MODEL_W * MODEL_H * (MODEL_CH === 3 ? 3 : 1));
  let j = 0;
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i], g = src[i+1], b = src[i+2];
    if (MODEL_CH === 3) { arr[j++] = r; arr[j++] = g; arr[j++] = b; }
    else {
      const gray = Math.round(0.2126*r + 0.7152*g + 0.0722*b);
      arr[j++] = gray;
    }
  }

  // 這裡 Module 已保證存在
  const ptr = Module._malloc(arr.length);
  Module.HEAPU8.set(arr, ptr);
  const label = classifyImage(ptr, MODEL_W, MODEL_H, MODEL_CH);
  const score = getLastScore();
  Module._free(ptr);

  const text = (label === 1 ? "Plastic" : (label === 0 ? "Paper" : "Invalid"));
  setStatus(`Result: ${text} (score=${score.toFixed(2)})`);
}

function toggleAutoScan() {
  if (!scanning) {
    scanning = true;
    scanBtn.textContent = "Stop Scanning";
    intervalId = setInterval(runOnce, 500);
  } else {
    scanning = false;
    scanBtn.textContent = "Start Scanning";
    clearInterval(intervalId);
    intervalId = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && intervalId) {
    clearInterval(intervalId);
    scanning = false;
    scanBtn.textContent = "Start Scanning";
  }
});

(async () => {
  canvas.width = MODEL_W; canvas.height = MODEL_H;
  scanBtn.disabled = true;                 // 預設禁用直到 WASM 準備好
  scanBtn.textContent = "Loading…";
  await initWasm();
  await initCamera();
  scanBtn.addEventListener("click", toggleAutoScan);
})();
