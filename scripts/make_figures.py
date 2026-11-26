#!/usr/bin/env python3
"""Annotates the captured screenshots and renders the result charts."""
import json, glob, os
from PIL import Image, ImageDraw, ImageFont

IMG = "results/images"
OUT = "results/figures"
os.makedirs(OUT, exist_ok=True)
facts = json.load(open(f"{IMG}/facts.json"))

INK = (26, 30, 36)
MUTED = (108, 120, 133)
ACCENT = (180, 83, 42)
OK = (47, 122, 74)
BAR = (31, 59, 87)
COLORS = ["#1f3b57", "#4b6b88", "#6f8fa8"]


def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def wrap(draw, text, fnt, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        test = (line + " " + w).strip()
        if draw.textlength(test, font=fnt) <= width:
            line = test
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def annotate(src, dst, title, note, tone="neutral", crop_bottom=0):
    im = Image.open(src).convert("RGB")
    if crop_bottom:
        im = im.crop((0, 0, im.width, im.height - crop_bottom))
    pad = 26
    title_f = font(30, bold=True)
    note_f = font(23)
    bar_h = 26
    # measure note height
    probe = ImageDraw.Draw(im)
    note_lines = wrap(probe, note, note_f, im.width - 2 * pad)
    foot_h = bar_h + len(note_lines) * (note_f.size + 9) + pad

    canvas = Image.new("RGB", (im.width, im.height + title_f.size + pad + foot_h), (255, 255, 255))
    canvas.paste(im, (0, title_f.size + pad))
    d = ImageDraw.Draw(canvas)
    d.text((pad, pad // 2), title, font=title_f, fill=INK)
    # tone stripe
    stripe = {"neutral": (207, 216, 226), "bad": (200, 90, 60), "good": (47, 122, 74)}[tone]
    d.rectangle([0, im.height + title_f.size + pad, canvas.width, im.height + title_f.size + pad + 5],
                fill=stripe)
    y = im.height + title_f.size + pad + bar_h // 2
    for line in note_lines:
        d.text((pad, y), line, font=note_f, fill=MUTED if tone == "neutral" else stripe)
        y += note_f.size + 9
    canvas.save(dst, optimize=True)
    print("annotated", os.path.basename(dst), canvas.size)


shots = [
    ("01-login.png", "fig01-login.png", "1. Sign-in page",
     "The authentication boundary. Every worker in the campaign materialises its own signed-in "
     "state from its own account; no two workers share a cookie jar.", "neutral", 0),
    ("02-loading.png", "fig02-loading.png", "2. Loading window: data requested, nothing painted",
     "The skeleton row is what a test observes if it asserts during the fetch. The baseline policy "
     "waits a fixed 800 ms and then reads the DOM; when the sum of the request latencies exceeds "
     "that, it reads this state and fails.", "bad", 0),
    ("03-painted.png", "fig03-painted.png", "3. Painted: the list has rendered",
     "The response arrived and the deferred render step ran. The rows and the total are correct. "
     "This is the state a well-synchronised test waits for.", "good", 0),
    ("04-hydration-window.png", "fig04-hydration-window.png",
     "4. The hydration window: painted but not yet interactive",
     f"The list is painted and the Save settings control is enabled "
     f"(isEnabled() = {str(facts.get('buttonEnabledInWindow')).lower()}), but its listener is not "
     f"attached yet (data-hydrated = {facts.get('hydratedDuringWindow')}). A click here is accepted "
     f"by the page and does nothing. This is the defect the trace diagnosed in Section 6.7, and it "
     f"is why \u201cenabled\u201d is the wrong condition to wait on.", "bad", 0),
    ("05-hydrated.png", "fig05-hydrated.png", "5. Hydrated: interactive",
     "data-hydrated = true. Every control now has its listener, so an action taken here has an "
     "effect. Waiting for this flag is the correct synchronisation condition.", "good", 0),
    ("06-settings-saved.png", "fig06-settings-saved.png", "6. A mutating flow: settings saved",
     "This is the flow that collided between parallel tests on a shared account: one worker saves "
     "dark while another saves light, and the first worker's assertion after reload reads the other "
     "worker's value. Per-worker accounts removed that failure.", "neutral", 0),
    ("07-filter-open.png", "fig07-filter-open.png", "7. Filtered view: open orders only",
     f"The open-only filter returns {facts.get('openRows')} of 3 rows. The filter re-fetches "
     f"asynchronously, so the assertion has to wait for the list to repaint, not for the click.", "neutral", 0),
    ("08-fixed-sleep-assert-window.png", "fig08-fixed-sleep-assert-window.png",
     "8. What the fixed-sleep baseline sees at assertion time",
     f"A fresh load with a 350 ms fixed wait: {facts.get('rowsAtShortSleep')} order rows are present. "
     f"The test then asserts three rows and fails. Nothing is wrong with the application; the test "
     f"asserted against a state it had guessed the timing of.", "bad", 0),
]
for args in shots:
    if os.path.exists(f"{IMG}/{args[0]}"):
        annotate(f"{IMG}/{args[0]}", f"{OUT}/{args[1]}", args[2], args[3], args[4], args[5])

# ---------------------------------------------------------------- charts
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

S = json.load(open("results/summary.json"))["conditions"]
order = [c for c in ["A", "B", "C"] if c in S]
labels = {"A": "A\nfixed sleeps\nshared account", "B": "B\nauto-waiting\nshared account",
          "C": "C\nauto-waiting\nisolated accounts"}
plt.rcParams.update({"font.size": 10, "axes.edgecolor": "#8a97a5", "axes.labelcolor": "#1a1e24",
                     "text.color": "#1a1e24", "xtick.color": "#3d4750", "ytick.color": "#3d4750"})

# 1. flakiness with Wilson CI
fig, ax = plt.subplots(figsize=(7.4, 4.4))
vals = [S[c]["flakinessRate"] * 100 for c in order]
err = [[(S[c]["flakinessRate"] - S[c]["flakinessCI"][0]) * 100 for c in order],
       [(S[c]["flakinessCI"][1] - S[c]["flakinessRate"]) * 100 for c in order]]
bars = ax.bar(range(len(order)), vals, color=COLORS[:len(order)],
              width=0.58, yerr=err, capsize=7, ecolor="#b4532a", error_kw={"lw": 1.6})
for i, c in enumerate(order):
    ax.text(i, vals[i] + err[1][i] + 2.5, f"{vals[i]:.1f}%", ha="center", fontsize=12, fontweight="bold")
    ax.text(i, 4, f"{S[c]['flakyTests']}/{S[c]['tests']} flaky\nn = {S[c]['repetitions']}",
            ha="center", va="bottom", fontsize=9, color="white", fontweight="bold")
ax.set_xticks(range(len(order)))
ax.set_xticklabels([labels[c] for c in order], fontsize=9.5)
ax.set_ylabel("Flakiness rate F (%)")
ax.set_title("Test-level flakiness rate by condition (Wilson 95% CI)", fontsize=12, fontweight="bold", pad=12)
ax.set_ylim(0, 100)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", color="#e6eaef", lw=0.9)
ax.set_axisbelow(True)
fig.tight_layout()
fig.savefig(f"{OUT}/fig09-flakiness-rate.png", dpi=200, facecolor="white")
plt.close(fig)

# 2. execution-level failures
fig, ax = plt.subplots(figsize=(7.4, 3.9))
vals = [S[c]["executionFailureRate"] * 100 for c in order]
ax.barh(range(len(order))[::-1], vals, color=COLORS[:len(order)], height=0.5)
for i, v in enumerate(vals):
    ax.text(v + 0.9, len(order) - 1 - i, f"{v:.1f}%", va="center", fontsize=11, fontweight="bold")
ax.set_yticks(range(len(order))[::-1])
ax.set_yticklabels([labels[c].replace("\n", " ") for c in order], fontsize=9.5)
ax.set_xlabel("Share of test executions that failed (%)")
ax.set_title("Execution-level failure rate", fontsize=12, fontweight="bold", pad=10)
ax.set_xlim(0, max(vals) * 1.25 + 3)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="x", color="#e6eaef", lw=0.9)
ax.set_axisbelow(True)
fig.tight_layout()
fig.savefig(f"{OUT}/fig10-execution-failures.png", dpi=200, facecolor="white")
plt.close(fig)

# 3. per-test failure rate heat strip
tests = sorted([t["test"] for t in S[order[0]]["perTest"]], key=lambda x: int(x.split(" ")[0][1:]))
fig, ax = plt.subplots(figsize=(9.2, 4.6))
mat = np.zeros((len(order), len(tests)))
for i, c in enumerate(order):
    by = {t["test"]: t["failureRate"] for t in S[c]["perTest"]}
    for j, t in enumerate(tests):
        mat[i, j] = by.get(t, 0) * 100
im = ax.imshow(mat, cmap="OrRd", vmin=0, vmax=100, aspect="auto")
for i in range(len(order)):
    for j in range(len(tests)):
        v = mat[i, j]
        ax.text(j, i, f"{v:.0f}", ha="center", va="center", fontsize=9,
                color="white" if v > 55 else "#2b333b")
ax.set_xticks(range(len(tests)))
ax.set_xticklabels([t.split(" ")[0] for t in tests], fontsize=9.5)
ax.set_yticks(range(len(order)))
ax.set_yticklabels([labels[c].replace("\n", " ") for c in order], fontsize=9)
ax.set_title("Per-test failure rate (% of executions)", fontsize=12, fontweight="bold", pad=10)
cb = fig.colorbar(im, ax=ax, fraction=0.025, pad=0.02)
cb.set_label("failure rate (%)")
fig.tight_layout()
fig.savefig(f"{OUT}/fig11-per-test-heatmap.png", dpi=200, facecolor="white")
plt.close(fig)

# 4. suite duration
fig, ax = plt.subplots(figsize=(7.4, 3.9))
vals = [S[c]["meanSuiteDurationMs"] / 1000 for c in order]
ax.bar(range(len(order)), vals, color=COLORS[:len(order)], width=0.55)
for i, v in enumerate(vals):
    ax.text(i, v + 1.2, f"{v:.1f} s", ha="center", fontsize=11, fontweight="bold")
ax.set_xticks(range(len(order)))
ax.set_xticklabels([labels[c] for c in order], fontsize=9.5)
ax.set_ylabel("Mean suite duration (s)")
ax.set_title("Cost of determinism: mean suite duration per repetition", fontsize=12,
             fontweight="bold", pad=12)
ax.set_ylim(0, max(vals) * 1.22)
ax.spines[["top", "right"]].set_visible(False)
ax.grid(axis="y", color="#e6eaef", lw=0.9)
ax.set_axisbelow(True)
fig.tight_layout()
fig.savefig(f"{OUT}/fig12-suite-duration.png", dpi=200, facecolor="white")
plt.close(fig)

# 5. dashboard
fig, axes = plt.subplots(2, 2, figsize=(11.5, 7.2))
a = axes[0][0]
a.bar(range(len(order)), [S[c]["flakinessRate"] * 100 for c in order],
      yerr=[[(S[c]["flakinessRate"] - S[c]["flakinessCI"][0]) * 100 for c in order],
            [(S[c]["flakinessCI"][1] - S[c]["flakinessRate"]) * 100 for c in order]],
      color=COLORS[:len(order)], capsize=5, ecolor="#b4532a", width=0.55)
a.set_title("Flakiness rate F (%) with 95% CI", fontsize=10.5, fontweight="bold")
a.set_xticks(range(len(order))); a.set_xticklabels(order)
a.set_ylim(0, 100); a.grid(axis="y", color="#eef1f5"); a.set_axisbelow(True)
a.spines[["top", "right"]].set_visible(False)

b = axes[0][1]
b.bar(range(len(order)), [S[c]["executionFailureRate"] * 100 for c in order],
      color=COLORS[:len(order)], width=0.55)
for i, c in enumerate(order):
    v = S[c]["executionFailureRate"] * 100
    b.text(i, v + 1.0, f"{v:.1f}%", ha="center", fontsize=9.5, fontweight="bold")
b.set_ylim(0, max(S[c]["executionFailureRate"] * 100 for c in order) * 1.2 + 2)
b.set_title("Execution-level failure rate (%)", fontsize=10.5, fontweight="bold")
b.set_xticks(range(len(order))); b.set_xticklabels(order)
b.grid(axis="y", color="#eef1f5"); b.set_axisbelow(True)
b.spines[["top", "right"]].set_visible(False)

c = axes[1][0]
c.bar(range(len(order)), [S[k]["meanSuiteDurationMs"] / 1000 for k in order],
      color=COLORS[:len(order)], width=0.55)
for i, k in enumerate(order):
    v = S[k]["meanSuiteDurationMs"] / 1000
    c.text(i, v + 1.5, f"{v:.1f}", ha="center", fontsize=9.5, fontweight="bold")
c.set_ylim(0, max(S[k]["meanSuiteDurationMs"] / 1000 for k in order) * 1.2)
c.set_title("Mean suite duration (s)", fontsize=10.5, fontweight="bold")
c.set_xticks(range(len(order))); c.set_xticklabels(order)
c.grid(axis="y", color="#eef1f5"); c.set_axisbelow(True)
c.spines[["top", "right"]].set_visible(False)

d = axes[1][1]
d.axis("off")
d.text(0.0, 0.95, "Frozen envelope", fontsize=10.5, fontweight="bold", va="top")
rows = [
    ("latency", "80 ms base + U(0, 240)"),
    ("render delay", "100 ms"),
    ("fixed wait (A)", "800 ms"),
    ("workers", "4"),
    ("engine", "Chromium (sandbox)"),
    ("repetitions", "A 8 / B 6 / C 6"),
]
y = 0.78
for k, v in rows:
    d.text(0.0, y, k, fontsize=9, color="#6c7885", va="top")
    d.text(0.42, y, v, fontsize=9, va="top")
    y -= 0.12
fig.suptitle("Deterministic cross-browser E2E automation \u2014 measured campaign",
             fontsize=13, fontweight="bold")
fig.tight_layout(rect=[0, 0, 1, 0.95])
fig.savefig(f"{OUT}/fig13-dashboard.png", dpi=200, facecolor="white")
plt.close(fig)

print("\nfigures written to", OUT)
for f in sorted(glob.glob(f"{OUT}/*.png")):
    print(" ", os.path.basename(f), round(os.path.getsize(f) / 1024), "KB")
