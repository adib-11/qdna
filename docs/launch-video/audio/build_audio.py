"""Build the qDNA launch film soundtrack: score, sound effects and voice-over mix.

The score and effects are synthesised with numpy, so nothing needs a licence.
Every event time mirrors the animatic in ../storyboard.html: retime a scene
there, retime it here. Voice-over lines are Fish Audio renders in vo/.

    python3 docs/launch-video/audio/build_audio.py

macOS only: afconvert decodes the MP3 lines and encodes the AAC outputs.
"""
import json
import pathlib
import subprocess
import tempfile
import wave

import numpy as np

SR = 48000
DUR = 80.0
N = int(SR * DUR)
HERE = pathlib.Path(__file__).parent
rng = np.random.default_rng(11)

# Scene starts in seconds, as in storyboard.html.
S = [0, 5, 11, 16, 24, 30, 38, 45, 51, 59, 68, 74]
# Where each voice-over line starts.
VO_AT = [2.9, 5.5, 11.6, 16.4, 24.3, 30.6, 38.5, 45.4, 51.0, 59.25, 68.45, 74.8]


# ---------- primitives ----------
def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def band(x, lo, hi):
    """Band-pass by spectral mask; fine for short one-shots."""
    X = np.fft.rfft(x)
    f = np.maximum(np.fft.rfftfreq(len(x), 1 / SR), 1)
    return np.fft.irfft(X / (1 + (lo / f) ** 4) / (1 + (f / hi) ** 4), len(x))


def hz(n):
    return 440 * 2 ** ((n - 69) / 12)


def place(dst, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i < 0:
        return
    s = sig[: N - i] * gain
    a = (pan + 1) * np.pi / 4
    dst[0, i : i + len(s)] += s * np.cos(a) * np.sqrt(2)
    dst[1, i : i + len(s)] += s * np.sin(a) * np.sqrt(2)


def smooth(x, n):
    c = np.cumsum(np.insert(x, 0, 0.0))
    y = (c[n:] - c[:-n]) / n
    pad = len(x) - len(y)
    return np.pad(y, (pad // 2, pad - pad // 2), mode="edge")


# ---------- instruments ----------
def pluck(n, d=1.6, bright=1.0):
    f, t = hz(n), tt(d)
    s = (
        np.sin(2 * np.pi * f * t) * np.exp(-t / 0.55)
        + 0.35 * bright * np.sin(2 * np.pi * f * 3.99 * t) * np.exp(-t / 0.09)
        + 0.12 * bright * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.03)
    )
    return s * np.minimum(t / 0.002, 1)


def pad(notes, d, att=0.6, rel=0.8):
    t = tt(d)
    s = np.zeros_like(t)
    for n in notes:
        for det in (-0.07, 0.07):
            f = hz(n + det)
            for k in range(1, 7):
                s += np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6)) / k**1.6
    e = np.minimum(t / att, 1) * np.clip((d - t) / rel, 0, 1)
    return s * e / (len(notes) * 4)


def kick():
    t = tt(0.45)
    f = 45 + 80 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) * np.minimum(t / 0.001, 1)


def hat():
    return band(noise(0.05), 7000, 16000) * np.exp(-tt(0.05) / 0.012)


def bass(n, d):
    t, f = tt(d), hz(n)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return s * np.minimum(t / 0.01, 1) * np.exp(-t / 1.2) * np.clip((d - t) / 0.08, 0, 1)


def bell(n, d=3.0):
    t, f = tt(d), hz(n)
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / tau)
            for r, a, tau in ((1, 1, 1.4), (2.76, 0.5, 0.7), (5.4, 0.25, 0.35), (8.93, 0.12, 0.2)))
    return s * np.minimum(t / 0.002, 1)


def boom():
    t = tt(1.8)
    f = 30 + 50 * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6) + 0.3 * band(noise(1.8), 40, 400) * np.exp(-t / 0.25)


# ---------- sound effects: paper and marking tools ----------
def paper():
    t = tt(0.18)
    return band(noise(0.18), 300, 5000) * np.exp(-t / 0.035) * 0.8 + 0.5 * np.sin(2 * np.pi * 90 * t) * np.exp(-t / 0.04)


def tick(f=2600):
    t = tt(0.03)
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006)


def click():
    t = tt(0.06)
    return band(noise(0.06), 1500, 8000) * np.exp(-t / 0.008) + 0.4 * np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.02)


def squeak(d=0.45):
    """Felt-tip highlighter: band noise with a fast wobble."""
    t = tt(d)
    wob = 0.6 + 0.4 * np.sin(2 * np.pi * 23 * t + rng.uniform(0, 6))
    e = np.minimum(t / 0.03, 1) * np.clip((d - t) / 0.06, 0, 1)
    return band(noise(d), 1800, 5200) * wob * e * 0.5


def nib(d=0.3):
    """Red-pen nib: bright noise with scratchy grains."""
    t = tt(d)
    grains = np.convolve((rng.random(len(t)) < 0.004).astype(float), np.exp(-np.arange(200) / 30), "same")
    e = np.minimum(t / 0.01, 1) * np.clip((d - t) / 0.05, 0, 1)
    return band(noise(d), 2500, 9000) * e * (0.15 + grains) * 0.6


def whip(d=0.35):
    t, x = tt(d), noise(d)
    out = np.zeros_like(x)
    for k in range(8):
        a, b = int(k * len(x) / 8), int((k + 1) * len(x) / 8)
        lo = 400 * 2 ** (k * 0.6)
        out[a:b] = band(x, lo, lo * 4)[a:b]
    return out * np.sin(np.pi * t / d) ** 2 * 0.7


def rustle(d):
    t = tt(d)
    am = smooth(rng.random(len(t)) ** 6, 2400)
    return band(noise(d), 500, 6000) * am * 3 * np.minimum(t / 0.8, 1) * np.clip((d - t) / 0.3, 0, 1)


def shimmer(up=True):
    d = 0.3
    t = tt(d)
    f = 900 + 900 * t / d if up else 1800 - 900 * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) * 0.35


def counter_ticks(dst, t0, dur, to, step, gain=0.12, f=2400):
    """One tick each time an eased counter passes a multiple of step."""
    last = 0
    for k in range(int(dur * 200)):
        p = k / (dur * 200)
        v = to * (1 - (1 - p) ** 2)
        if v // step > last // step:
            place(dst, tick(f), t0 + p * dur, gain)
        last = v


# ---------- score ----------
CHORDS = [[53, 57, 60, 64], [50, 53, 57, 60, 64], [46, 50, 53, 57, 60], [48, 53, 55, 60]]
ROOTS = [41, 38, 34, 36]
ARP = [0, 1, 2, 3, 2, 1, 2, 3]
T0, BAR, EIGHTH = 11.0, 2.5, 0.3125


def layers(t):
    """What plays at time t, following the beat map."""
    if t < 16:
        return {"arp": 0.55}
    if t < 24:
        return {"arp": 0.6, "kick": "half", "bass": 1}
    if t < 30:
        return {"arp": 0.6, "kick": "half", "bass": 1, "hat": 1}
    if t < 38:
        return {"arp": 0.65, "kick": "four", "bass": 1, "hat": 1, "pad": 1}
    if t < 45:
        return {"arp": 0.7, "arp2": 1, "kick": "four", "bass": 1, "hat": 1, "pad": 1}
    if t < 51:
        return {"arp": 0.5, "sparse": 1, "pad": 1}
    if t < 59:
        return {"arp": 0.75, "arp2": 1, "kick": "four", "bass": 1, "hat": 1, "pad": 1}
    if t < 65.25:
        return {"arp": 0.4}
    if t < 68:
        return {"arp": 0.7, "kick": "four", "bass": 1, "hat": 1}
    if t < 74:
        return {"arp": 0.6, "kick": "half", "bass": 1, "hat": 1, "pad": 0.7}
    if t < 76.5:
        return {"arp": 0.5, "pad": 0.7}
    return {}


def build_music():
    m = np.zeros((2, N))
    place(m, pluck(41, 3.0, 0.5), 3.0, 0.5)  # single low pluck under scene 01's line
    place(m, pad([53, 54, 56, 59, 60], 6.0, att=4.5, rel=0.02), 5.0, 0.9)  # scene 02 cluster, cut dead at 11.0
    b = 0
    while T0 + b * BAR < 76.5:
        bt = T0 + b * BAR
        ch, root = CHORDS[b % 4], ROOTS[b % 4]
        lb = layers(bt)
        if lb.get("pad"):
            place(m, pad(ch, BAR + 0.8), bt, 0.55 * lb["pad"])
        if lb.get("bass"):
            place(m, bass(root, BAR * 0.95), bt, 0.55)
        for e in range(8):
            te = bt + e * EIGHTH
            if te >= 76.5:
                break
            le = layers(te)
            top = ch[-4:]
            if le.get("arp") and not (le.get("sparse") and e % 2):
                place(m, pluck(top[ARP[e]] + 12), te, 0.22 * le["arp"], pan=0.25)
            if le.get("arp2") and e % 2 == 0:
                place(m, pluck(top[ARP[(e + 3) % 8]] + 24, 1.0, 0.6), te, 0.1, pan=-0.35)
            if le.get("hat"):
                place(m, hat(), te, 0.07 if e % 2 else 0.04, pan=0.3)
            k = le.get("kick")
            if (k == "four" and e % 2 == 0) or (k == "half" and e in (0, 4)):
                place(m, kick(), te, 0.6)
        b += 1
    for n in [41, 53, 57, 60, 64, 67]:  # final Fmaj9 on the yellow cell
        place(m, bell(n + 12, 3.5) if n > 41 else bass(n, 3.5), 76.5, 0.18 if n > 41 else 0.5)
    place(m, pad([53, 57, 60, 64, 67], 3.5, att=0.05, rel=1.5), 76.5, 0.5)
    return m


# ---------- effects, timed to the animation ----------
def build_sfx():
    x = np.zeros((2, N))
    # 01 the pile
    place(x, nib(0.9), S[0] + 0.15, 0.25)
    for i in range(7):
        place(x, paper(), S[0] + 1.7 + i * 0.11 + 0.18, 0.7, pan=-0.6 + i * 0.2)
    # 02 overload
    place(x, rustle(5.9), S[1], 0.5)
    counter_ticks(x, S[1] + 0.9, 1.5, 154, 6)
    place(x, squeak(0.5), S[1] + 3.6, 0.8)
    # 03 title
    place(x, whip(), S[2], 0.6)
    place(x, squeak(0.6), S[2] + 1.55, 0.8)
    # 04 drop the papers in
    for i in range(3):
        place(x, paper(), S[3] + 0.45 + i * 0.18 + 0.2, 0.6, pan=-0.3 + i * 0.3)
    place(x, click(), S[3] + 2.2, 0.7)
    for i in range(12):
        place(x, tick(3000 + (i % 4) * 150), S[3] + 3.1 + i * 0.05, 0.12)
    place(x, nib(0.3), S[3] + 4.05, 0.6)
    for k in range(4):
        place(x, shimmer(True), S[3] + 4.45 + k * 0.42 + 0.25, 0.4, pan=0.4)
        place(x, shimmer(False), S[3] + 5.1 + k * 0.42 + 0.2, 0.3, pan=-0.2)
    for k in range(21):
        place(x, tick(4200), S[3] + 5.1 + k * 0.09, 0.05, pan=0.6)
    # 05 one question
    place(x, nib(0.4), S[4] + 1.5, 0.8, pan=0.6)
    for i in range(4):
        place(x, tick(2000 + i * 300), S[4] + 2.0 + i * 0.2, 0.2)
    # 06 genome map: one soft tick per filled cell, pitched up by year
    genome = [[2, 3, 0, 0, 0, 5, 0], [3, 2, 1, 1, 2, 1, 0], [0, 0, 2, 2, 4, 0, 0], [0, 3, 2, 0, 1, 0, 0],
              [0, 1, 3, 2, 0, 0, 0], [1, 0, 0, 0, 0, 4, 0], [2, 0, 0, 1, 0, 2, 0], [4, 0, 0, 0, 1, 0, 0],
              [2, 1, 1, 0, 1, 0, 0], [0, 1, 1, 2, 1, 0, 0], [0, 0, 2, 3, 0, 0, 0], [1, 4, 0, 0, 0, 0, 0]]
    for c in range(7):
        for r, row in enumerate(genome):
            if row[c]:
                place(x, tick(1600 + c * 200), S[5] + 0.75 + c * 0.5 + r * 0.025, 0.1, pan=-0.5 + c / 6)
    # 07 pareto
    for k, n in enumerate([72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95]):
        place(x, pluck(n, 0.6, 0.4), S[6] + 0.4 + k * 0.1, 0.08, pan=-0.6 + k / 12)
    place(x, bell(84, 3.0), S[6] + 2.9, 0.35)
    place(x, squeak(0.5), S[6] + 4.6, 0.8)
    # 08 lineage
    for t in (0.3, 1.3, 2.8):
        place(x, click(), S[7] + t, 0.5)
    place(x, squeak(0.35), S[7] + 2.1, 0.7)
    place(x, squeak(0.35), S[7] + 2.35, 0.7)
    # 09 study plan
    for i in range(6):
        place(x, squeak(0.45), S[8] + 0.65 + i * 0.36, 0.6, pan=-0.2)
        place(x, nib(0.3), S[8] + 1.0 + i * 0.36, 0.55, pan=0.6)
    place(x, rustle(1.8), S[8] + 4.6, 0.35)
    # 10 backtest (inner timeline starts 1.7 s in)
    b = S[9] + 1.7
    for t in (0.9, 2.5):
        place(x, whip(0.12), b + t, 0.5)
        place(x, paper(), b + t + 0.17, 0.5)
    for k in range(6):
        place(x, tick(2800), b + 1.5 + k * 0.05, 0.08)
    for i in range(15):
        place(x, tick(2200 + (i % 3) * 200), b + 2.95 + i * 0.04, 0.07)
    place(x, boom(), b + 4.55, 0.9)
    counter_ticks(x, b + 4.55, 0.9, 11, 1, gain=0.15, f=1800)
    # 11 practice and hints
    for i in range(5):
        place(x, nib(0.25), S[10] + 0.5 + i * 0.32, 0.4, pan=-0.5)
    place(x, click(), S[10] + 3.8, 0.7, pan=0.4)
    place(x, bell(84, 1.6), S[10] + 4.05, 0.18, pan=0.4)
    place(x, bell(91, 1.4), S[10] + 4.14, 0.14, pan=0.4)
    # 12 end card
    place(x, squeak(0.5), S[11] + 2.5, 0.7, pan=0.5)
    for k in range(15):  # one tick per character of "qdna.vercel.app"
        place(x, tick(3600 + (k % 5) * 90), S[11] + 2.7 + k * 1.1 / 15, 0.06)
    return x


# ---------- voice-over ----------
def read_wav(path):
    with wave.open(str(path)) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
        return a.reshape(-1, w.getnchannels()).mean(axis=1)


def build_vo(tmp):
    v = np.zeros((2, N))
    timing = []
    for i, at in enumerate(VO_AT, 1):
        wav = tmp / f"vo{i:02d}.wav"
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@48000", "-c", "1",
                        str(HERE / "vo" / f"vo{i:02d}.mp3"), str(wav)], check=True)
        a = read_wav(wav)
        a = a / (np.sqrt(np.mean(a[np.abs(a) > 0.01] ** 2)) + 1e-9) * 0.12  # equal speech level
        place(v, a, at)
        timing.append([at, round(len(a) / SR, 2)])
    return v, timing


# ---------- loudness (ITU-R BS.1770) ----------
def k_weight(x):
    f = np.fft.rfftfreq(x.shape[-1], 1 / SR)
    z = np.exp(-2j * np.pi * f / SR)

    def h(b, a):
        return (b[0] + b[1] * z + b[2] * z**2) / (a[0] + a[1] * z + a[2] * z**2)

    H = h([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585])
    H *= h([1, -2, 1], [1, -1.99004745483398, 0.99007225036621])
    return np.fft.irfft(np.fft.rfft(x) * H, x.shape[-1])


def lufs(x):
    y = k_weight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    z = np.array([np.sum(np.mean(y[:, i : i + blk] ** 2, axis=1)) for i in range(0, y.shape[1] - blk, hop)])
    lz = -0.691 + 10 * np.log10(z + 1e-12)
    z = z[lz > -70]
    rel = -0.691 + 10 * np.log10(np.mean(z)) - 10
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return -0.691 + 10 * np.log10(np.mean(z))


def true_peak(x):
    up = np.fft.irfft(np.fft.rfft(x), 4 * x.shape[-1]) * 4
    return np.max(np.abs(up))


def limit(x, ceiling):
    """Look-ahead-free peak limiter: smoothed gain wherever 4x-oversampled peaks pass the ceiling."""
    for _ in range(3):
        up = np.abs(np.fft.irfft(np.fft.rfft(x), 4 * x.shape[-1]) * 4).max(axis=0)
        peak = up.reshape(-1, 4).max(axis=1)
        need = np.minimum(1, ceiling * 0.98 / np.maximum(peak, 1e-9))
        # Min over +-3 blocks of 2 ms, then a 4 ms average: the minimum is wider
        # than the smoothing, so no peak escapes it.
        blk = 96
        nb = need.reshape(-1, blk).min(axis=1)
        nb = np.minimum.reduce([np.roll(nb, s) for s in range(-3, 4)])
        g = smooth(np.repeat(nb, blk), 2 * blk + 1)
        x = x * g
        if true_peak(x) <= ceiling:
            break
    return x


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16).T.copy()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def aac(src, dst):
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "192000", str(src), str(dst)], check=True)


def main():
    with tempfile.TemporaryDirectory() as d:
        tmp = pathlib.Path(d)
        vo, timing = build_vo(tmp)
        music = build_music()
        sfx = build_sfx()
        music *= 0.045 / np.sqrt(np.mean(music[:, int(11 * SR) :] ** 2))
        sfx *= 0.35 / np.max(np.abs(sfx))
        # Duck the music 6 dB under the voice.
        talk = smooth((smooth(np.abs(vo[0]), int(0.1 * SR)) > 0.01).astype(float), int(0.3 * SR))
        music *= 1 - 0.5 * talk
        mix = vo + music + sfx
        fade = np.clip((DUR - 0.2 - np.arange(N) / SR) / 0.25, 0, 1)
        mix *= fade
        gain = 10 ** ((-14 - lufs(mix)) / 20)
        mix = limit(mix * gain, 10 ** (-1 / 20))
        print(f"mix: {lufs(mix):.1f} LUFS, true peak {20 * np.log10(true_peak(mix)):.1f} dBTP")
        for name, x in (("launch-mix", mix), ("stem-vo", vo * gain), ("stem-music", music * gain * fade), ("stem-sfx", sfx * gain * fade)):
            write(tmp / f"{name}.wav", x)
            # The mix is .mp4 (same AAC data) so the published artifact can serve it.
            aac(tmp / f"{name}.wav", HERE / (f"{name}.mp4" if name == "launch-mix" else f"{name}.m4a"))
        (HERE / "vo-timing.json").write_text(json.dumps(timing))


if __name__ == "__main__":
    main()
