#define ECG_PIN   36
#define LO_PLUS   25
#define LO_MINUS  26

// === FILTER ===
float hp_prev_input = 0, hp_prev_output = 0, lp_prev = 0;
#define MA_SIZE 8
float maBuffer[MA_SIZE];
int maIndex = 0;

float highPass(float x) {
  const float alpha = 0.95;
  float y = alpha * (hp_prev_output + x - hp_prev_input);
  hp_prev_input = x;
  hp_prev_output = y;
  return y;
}

float lowPass(float x) {
  const float alpha = 0.2;
  lp_prev = lp_prev + alpha * (x - lp_prev);
  return lp_prev;
}

float movingAverage(float x) {
  maBuffer[maIndex] = x;
  maIndex = (maIndex + 1) % MA_SIZE;
  float sum = 0;
  for (int i = 0; i < MA_SIZE; i++) sum += maBuffer[i];
  return sum / MA_SIZE;
}

// === BPM SMOOTHING ===
#define BPM_BUF_SIZE 6
float bpmBuffer[BPM_BUF_SIZE] = {0};
int bpmIndex = 0;

float smoothBPM(float newBPM) {
  bpmBuffer[bpmIndex] = newBPM;
  bpmIndex = (bpmIndex + 1) % BPM_BUF_SIZE;
  float sum = 0;
  for (int i = 0; i < BPM_BUF_SIZE; i++) sum += bpmBuffer[i];
  return sum / BPM_BUF_SIZE;
}

// === HEART RATE ===
float signalMax = 100;
float threshold = 60;
unsigned long lastPeakTime = 0;  // refractory
unsigned long previousPeak = 0;  // tính RR
float bpm = 0;
const int refractoryPeriod = 300;

float CalculateBPM(float ecg) {
  float signal = abs(ecg);
  signalMax *= 0.999;
  if (signal > signalMax) signalMax = signal;
  threshold = signalMax * 0.6;

  unsigned long now = millis();

  if (signal > threshold && (now - lastPeakTime) > refractoryPeriod) {
    if (previousPeak != 0) {
      float rr = now - previousPeak;
      if (rr > 300 && rr < 2000) {
        float rawBPM = 60000.0 / rr;
        bpm = smoothBPM(rawBPM); // smooth qua nhiều nhịp
      }
    }

    previousPeak = lastPeakTime; // ✅ Fix: lưu peak trước
    lastPeakTime = now;          // ✅ Fix: cập nhật peak hiện tại
  }
  return bpm;
}

// === SETUP / LOOP ===
void setup() {
  Serial.begin(115200);
  pinMode(LO_PLUS, INPUT);
  pinMode(LO_MINUS, INPUT);
  analogReadResolution(12);
}

void loop() {
  int raw = analogRead(ECG_PIN);
  float hp = highPass(raw);
  float lp = lowPass(hp);
  float filtered = movingAverage(lp);
  float currentBPM = CalculateBPM(filtered);

  String status;
  if (currentBPM == 0)       status = "NOTFOUND";
  else if (currentBPM < 60)  status = "BRADYCARDIA";
  else if (currentBPM > 100) status = "TACHYCARDIA";
  else                       status = "NORMAL";

  // Chỉ print mỗi 20 lần sample (~100ms)
  static int printCounter = 0;
  if (++printCounter >= 20) {
    printCounter = 0;
    Serial.print(raw); Serial.print(",");
    Serial.print(filtered); Serial.print(",");
    Serial.print(threshold); Serial.print(",");
    Serial.print(currentBPM); Serial.print(",");
    Serial.println(status);
  }

  delay(4); // ✅ 250 Hz
}