// D:\恩\小論文\模型\web\app.js
// 需要：編譯時 -s MODULARIZE=1 -s EXPORT_NAME=createModule
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");   // 尺寸=模型輸入
const ctx = canvas.getContext("2d");
const resultText = document.getElementById("result");
const scanBtn = document.getElementById("scan");
const debugText = document.getElementById("debug"); // 可自行在 index.html 加一行 <p id="debug"></p>

let moduleInstance = null;
let classifyImage = null;
let getLastScore = null;
let setInputShape = null;

let scanning = false;
let intervalId = null;

// === 你的模型輸入大小（要跟 C++ 初始值一致，或用 set_input_shape 設）===
const MODEL_W = 96;
const MODEL_H = 96;
const MODEL_CH = 3;

async function initWasm() {
  moduleInstance = await createModule();
  // 包裝 C 函式
  classifyImage = moduleInstance.cwrap("classify_image", "number", ["number","number","number","number"]);
  getLastScore  = moduleInstance.cwrap("get_last_score", "number", []);
  setInputShape = moduleInstance.cwrap("set_input_shape", null, ["number","number","number"]);
  // 同步 C++ 的輸入尺寸（如果你在 C++ 改過）
  setInputShape(MODEL_W, MODEL_H, MODEL_CH);
}

async function initCamera() {
  const constraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    resultText.textContent = "Camera blocked: " + err.message;
    throw err;
  }
}

// 把當前影格餵進 WASM 模型
function singleScan() {
  if (!video || video.readyState < 2) return;

  // 1) 縮圖到模型尺寸（會覆蓋 canvas）
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 2) 取像素
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src = imgData.data; // RGBA...
  // 3) 打包成 RGB (或 Gray) Uint8Array
  let arr;
  if (MODEL_CH === 3) {
    arr = new Uint8Array(MODEL_W * MODEL_H * 3);
    let j = 0;
    for (let i = 0; i < src.length; i += 4) {
      arr[j++] = src[i];     // R
      arr[j++] = src[i + 1]; // G
      arr[j++] = src[i + 2]; // B
      // 忽略 A
    }
  } else {
    arr = new Uint8Array(MODEL_W * MODEL_H);
    let j = 0;
    for (let i = 0; i < src.length; i += 4) {
      // 灰階
      const gray = Math.round(0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]);
      arr[j++] = gray;
    }
  }

  // 4) 配置 WASM 記憶體並拷貝
  const bytes = arr.length;
  const ptr = moduleInstance._malloc(bytes);
  moduleInstance.HEAPU8.set(arr, ptr);

  // 5) 呼叫 C++ 推論
  const label = classifyImage(ptr, MODEL_W, MODEL_H, MODEL_CH);
  const score = getLastScore();

  // 6) 釋放記憶體
  moduleInstance._free(ptr);

  // 7) 顯示結果（示範：0=Paper, 1=Plastic）
  const text = (label === 1 ? "Plastic" : (label === 0 ? "Paper" : "Invalid"));
  resultText.textContent = `Result: ${text}  (score=${score.toFixed(3)})`;

  if (debugText) {
    debugText.textContent = `buffer=${bytes} bytes, label=${label}`;
  }
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

  // 確保 canvas 尺寸與模型一致
  canvas.width  = MODEL_W;
  canvas.height = MODEL_H;

  scanBtn.textContent = "Start Scanning";
  scanBtn.addEventListener("click", toggleAutoScan);
})();
