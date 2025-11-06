// 需要用 emcc 編譯時加：-s MODULARIZE=1 -s EXPORT_NAME=createModule
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const resultText = document.getElementById("result");
const scanBtn = document.getElementById("scan");
const debugText = document.getElementById("debug");
const bar = document.getElementById("bar");

let moduleInstance = null;
let classifyImage = null;
let getLastScore = null;
let setInputShape = null;

let scanning = false;
let intervalId = null;

const MODEL_W = 96, MODEL_H = 96, MODEL_CH = 3;

async function initWasm() {
  moduleInstance = await createModule();
  classifyImage = moduleInstance.cwrap("classify_image", "number", ["number","number","number","number"]);
  getLastScore  = moduleInstance.cwrap("get_last_score", "number", []);
  setInputShape = moduleInstance.cwrap("set_input_shape", null, ["number","number","number"]);
  setInputShape(MODEL_W, MODEL_H, MODEL_CH);
}

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    resultText.textContent = "Camera blocked: " + err.message;
    throw err;
  }
}

function singleScan() {
  if (!video || video.readyState < 2) return;

  // 將當前影像縮到模型輸入大小
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 取像素並打包成 RGB Uint8Array
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src = img.data;
  const arr = new Uint8Array(MODEL_W * MODEL_H * (MODEL_CH === 3 ? 3 : 1));

  let j = 0, sumLuma = 0;
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i], g = src[i+1], b = src[i+2];
    if (MODEL_CH === 3) {
      arr[j++] = r; arr[j++] = g; arr[j++] = b;
    } else {
      const gray = Math.round(0.2126*r + 0.7152*g + 0.0722*b);
      arr[j++] = gray;
    }
    sumLuma += 0.2126*r + 0.7152*g + 0.0722*b;
  }
  const avg = sumLuma / (src.length / 4); // 0~255

  const ptr = moduleInstance._malloc(arr.length);
  moduleInstance.HEAPU8.set(arr, ptr);
  const label = classifyImage(ptr, MODEL_W, MODEL_H, MODEL_CH);
  const score = getLastScore();
  moduleInstance._free(ptr);

  const text = (label === 1 ? "Plastic" : (label === 0 ? "Paper" : "Invalid"));
  resultText.textContent = `Result: ${text} (score=${score.toFixed(2)})`;
  debugText.textContent = `Avg Brightness: ${avg.toFixed(1)}`;
  bar.style.width = `${Math.round(score*100)}%`;
}

function toggleAutoScan() {
  if (!scanning) {
    scanning = true;
    scanBtn.textContent = "Stop Scanning";
    intervalId = setInterval(singleScan, 500);
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
  await initWasm();
  await initCamera();
  scanBtn.textContent = "Start Scanning";
  scanBtn.addEventListener("click", toggleAutoScan);
})();
