#define ECG_PIN   36      // VP
#define LO_PLUS   25
#define LO_MINUS  26 

// = FILTER =

float hp_prev_input = 0;
float hp_prev_output = 0;

float lp_prev = 0;

#define MA_SIZE 8
float maBuffer[MA_SIZE];
int maIndex = 0;

float highPass(float x)
{
  const float alpha = 0.95;

  float y =
      alpha *
      (hp_prev_output + x - hp_prev_input);

  hp_prev_input = x;
  hp_prev_output = y;

  return y;
}

float lowPass(float x)
{
  const float alpha = 0.2;

  lp_prev =
      lp_prev +
      alpha * (x - lp_prev);

  return lp_prev;
}

float movingAverage(float x)
{
  maBuffer[maIndex] = x;

  maIndex =
      (maIndex + 1) % MA_SIZE;

  float sum = 0;

  for (int i = 0; i < MA_SIZE; i++)
  {
    sum += maBuffer[i];
  }

  return sum / MA_SIZE;
}

// ================= HEART RATE =================

float signalMax = 100;
float threshold = 60;

unsigned long lastPeakTime = 0;
unsigned long previousPeak = 0;

float bpm = 0;
String status = "NO DATA";

const int refractoryPeriod = 300;

void detectRPeak(float ecg)
{
  float signal = abs(ecg);

  // Cho signalMax giảm từ từ
  signalMax *= 0.999;

  if (signal > signalMax)
  {
    signalMax = signal;
  }

  threshold = signalMax * 0.6;

  unsigned long now = millis();

  if (signal > threshold &&
      (now - lastPeakTime) > refractoryPeriod)
  {
    if (previousPeak != 0)
    {
      float rr = now - previousPeak;

      if (rr > 300 && rr < 2000)
      {
        bpm = 60000.0 / rr;

        if (bpm < 60)
        {
          status = "BRADYCARDIA";
        }
        else if (bpm > 100)
        {
          status = "TACHYCARDIA";
        }
        else
        {
          status = "NORMAL";
        }

        Serial.print("RR=");
        Serial.print(rr);
        Serial.print(" ms  BPM=");
        Serial.print(bpm);
        Serial.print("  STATUS=");
        Serial.println(status);
      }
    }

    previousPeak = now;
    lastPeakTime = now;
  }
}

// ================= SETUP =================

void setup()
{
  Serial.begin(115200);

  pinMode(LO_PLUS, INPUT);
  pinMode(LO_MINUS, INPUT);

  analogReadResolution(12);

  Serial.println("ECG Monitor Started");
}

// ================= LOOP =================

void loop()
{
  // Lead Off Detection

  //if (digitalRead(LO_PLUS) == HIGH ||
    //  digitalRead(LO_MINUS) == HIGH)
  //{
    //Serial.println("Lead Off!");
    //delay(100);
    //return;
  //}
  Serial.println(analogRead(36));

  // Raw ECG

  int raw = analogRead(ECG_PIN);

  // Filters

  float hp = highPass(raw);

  float lp = lowPass(hp);

  float filtered =
      movingAverage(lp);

  // Detect R Peak

  detectRPeak(filtered);

  // Serial Plotter
  // Raw, Filtered, Threshold, BPM

  Serial.print(raw);
  Serial.print(",");

  Serial.print(filtered);
  Serial.print(",");

  Serial.print(threshold);
  Serial.print(",");

  Serial.println(bpm * 10);

  delay(1000);   // 250 Hz
}