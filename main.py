from scipy.signal import find_peaks
import numpy as np
import pandas as pd

def find_r_peaks(signal, min_height=200, min_distance=150):
    """
    Tìm R-peaks trong tín hiệu ECG
    """

    peaks, _ = find_peaks(
        signal,
        height=min_height,
        distance=min_distance
    )

    return peaks


def find_rr_intervals(peaks, time_ms):
    """
    Tính RR intervals
    Vd 370 - 77 = 293 samples
    mà 1 sample = 1/360 s 
    nên 293 samples tương đương 813 ms 
    """

    peak_times = time_ms[peaks]

    rr = np.diff(peak_times)

    return rr

def calculate_heart_rate(rr_intervals):
    """
    Tính BPM từ RR intervals
    """

    bpm = 60000 / rr_intervals

    avg_bpm = np.mean(bpm)

    return bpm, avg_bpm


"""
Các giá trị phụ
"""

def find_q_points(signal, r_peaks, search_window=40):
    """
    Tìm Q point cho mỗi R peak

    """

    q_points = []

    for r in r_peaks:

        start = max(0, r - search_window)

        q = np.argmin(signal[start:r+1]) + start

        q_points.append(q)

    return np.array(q_points)

def find_s_points(signal, r_peaks, search_window=40):
    """
    Tìm S point cho mỗi R peak
    """

    s_points = []

    n = len(signal)

    for r in r_peaks:

        end = min(n, r + search_window)

        s = np.argmin(signal[r:end]) + r

        s_points.append(s)

    return np.array(s_points)

def find_p_points(signal, q_peaks, search_window=210):
    """
    Tìm P point cho mỗi R peak

    """

    p_points = []

    for q in q_peaks:

        start = max(0, q - search_window)

        p = np.argmax(signal[start:q+1]) + start

        p_points.append(p)

    return np.array(p_points)

def find_t_points(signal, s_peaks, search_window=210):
    """
    Tìm T point cho mỗi R peak
    """

    t_points = []

    n = len(signal)

    for s in s_peaks:

        end = min(n, s + search_window)

        t = np.argmax(signal[s:end]) + s

        t_points.append(t)

    return np.array(t_points)

"""
def find_p_points(signal, q_points, fs=360):

    p_points = []

    window = int(0.2 * fs)

    for q in q_points:

        start = max(0, q - window)

        if start >= q:
            continue

        p = np.argmax(signal[start:q]) + start

        p_points.append(p)

    return np.array(p_points)

def find_t_points(signal, s_points, fs=360):

    t_points = []

    window = int(0.4 * fs)

    n = len(signal)

    for s in s_points:

        end = min(n, s + window)

        if end <= s:
            continue

        t = np.argmax(signal[s:end]) + s

        t_points.append(t)

    return np.array(t_points)
"""

"""
Test
"""

df = pd.read_csv("ecg_filtered.csv")

signal = df["adc"].values
time_ms = df["time_ms"].values

peaks = find_r_peaks(signal)

rr = find_rr_intervals(
    peaks,
    time_ms
)

bpm, avg_bpm = calculate_heart_rate(rr)

q_points = find_q_points(signal, peaks)
s_points = find_s_points(signal, peaks)
p_points = find_p_points(signal, q_points)
t_points = find_t_points(signal, s_points)

print("Peaks:")
print(peaks)

print("\nRR intervals (ms):")
print(rr)

print("BPM:")
print(bpm)

print("\nAverage BPM:")
print(avg_bpm)

print("\nQ point:")
print(q_points)

print("\nS point:")
print(s_points)

print("\nP point:")
print(p_points)

print("\nT point:")
print(t_points)