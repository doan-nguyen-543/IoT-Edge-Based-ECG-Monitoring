import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("ecg_esp32.csv")

# 5 giây đầu
df = df[df["time_ms"] <= 10000]

plt.figure(figsize=(15,5))
plt.plot(df["time_ms"], df["adc"])

plt.title("ECG - First few seconds")
plt.xlabel("Time (ms)")
plt.ylabel("ADC")
plt.grid(True)

plt.show()