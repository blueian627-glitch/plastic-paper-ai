// D:\恩\小論文\模型\classify.cpp
#include <emscripten.h>
#include <cmath>
#include <cstdint>

// === 你可以改成你的模型需要的輸入大小 ===
static int g_in_w  = 96;
static int g_in_h  = 96;
static int g_in_ch = 3;   // RGB=3, 灰階=1

// 上一次推論的機率（示範）
static float g_last_score = 0.0f;

// 可選：讓 JS 設定輸入尺寸（若你的模型不是 96x96）
extern "C" {
EMSCRIPTEN_KEEPALIVE
void set_input_shape(int w, int h, int ch) {
    if (w>0 && h>0 && (ch==1 || ch==3)) {
        g_in_w = w; g_in_h = h; g_in_ch = ch;
    }
}
}

// 你的核心推論：pixels 是長度 w*h*ch 的 uint8_t 陣列（0~255）
extern "C" {
EMSCRIPTEN_KEEPALIVE
int classify_image(uint8_t* pixels, int w, int h, int ch) {
    if (w!=g_in_w || h!=g_in_h || ch!=g_in_ch || pixels==nullptr) {
        g_last_score = 0.0f;
        return -1; // 代表輸入大小不符
    }

    // ====== (示範) 前處理：把像素轉成[0,1]並計算一個簡單特徵 ======
    // 這裡只是示範：取平均亮度作為一個非常簡單的特徵。
    double sum = 0.0;
    const int N = w*h;
    if (ch == 3) {
        for (int i = 0; i < N; ++i) {
            int base = i*3;
            // 人眼加權亮度
            double luma = 0.2126*pixels[base+0] + 0.7152*pixels[base+1] + 0.0722*pixels[base+2];
            sum += luma/255.0;
        }
    } else { // 灰階
        for (int i = 0; i < N; ++i) {
            sum += (pixels[i]/255.0);
        }
    }
    double feat = sum / N; // 0~1

    // ====== TODO: 這裡換成你的模型推論 ======
    // 例如：float prob_plastic = my_model_predict(pixels, w,h,ch);
    // 現在先用一個「線性 + sigmoid」的玩具模型示範：
    // 假裝 feat 越亮越像塑膠
    double logits = 6.0*(feat - 0.5);       // 線性
    double prob   = 1.0 / (1.0 + std::exp(-logits)); // sigmoid

    // ====== 輸出：返回 label，並把 prob 存到 g_last_score ======
    g_last_score = static_cast<float>(prob);
    int label = (prob >= 0.5) ? 1 : 0;  // 1=Plastic, 0=Paper
    return label;
}

EMSCRIPTEN_KEEPALIVE
float get_last_score() {
    return g_last_score; // 回傳上次推論的 "Plastic" 機率
}
}
