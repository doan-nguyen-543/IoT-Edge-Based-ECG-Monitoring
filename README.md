# Edge-Based ECG Monitoring and Heart Abnormality Detection System Using AD8232 and ESP32

## Overview

This is a low-cost ECG monitoring and heart abnormality detection system using the AD8232 ECG sensor and ESP32 microcontroller. The system captures ECG signals from a user, processes the signal locally onto the ESP32, calculates BPM, detects common cardiac abnormalities, and provides real-time  alerts.

---

## System Architecture

```text
AD8232 ECG Sensor
        │
        ▼
      ESP32
        │
 ┌──────────────┐
 │              │
 ▼              ▼
OLED          Buzzer
Display        Alert

```

---

## Hardware Requirements

| Component                | Quantity |
| ------------------------ | -------- |
| ESP32 Development Board  | 1        |
| AD8232 ECG Sensor Module | 1        |
| Breadboard               | 2        |
| Jumper Wires             | Several  |
| USB Cable                | 1        |

---

## Project Structure

```text
ECG-Monitor/
├── data/
│   ├── ecg_esp32.csv       <-Raw ECG samples collected from ESP32
│   └── ecg_filtered.csv    <-Filtered ECG samples after signal processin
│
├── src/
│   ├── main.py             <-Reads ECG data from ESP32, performs BPM calculation, exports processed data
│   ├── plot.py             <-Displays raw ECG waveform
│   └── plot0.py            <-Displays filtered ECG waveform and analysis results
│
├── images/
│   ├── raw_ecg.png
│   ├── filtered_ecg.png
│   └── hardware_setup.jpg
│
├── requirements.txt
│
└── README.md
```

---

## Detection Rules

### Tachycardia

```text
BPM > 100
```

### Bradycardia

```text
BPM < 60
```

### Irregular Rhythm

```text
|RRn − RRn−1| > Threshold
```
