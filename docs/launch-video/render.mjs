// Render the storyboard animatic to H.264 MP4: seek GSAP master per frame, screenshot, pipe to ffmpeg.
import { createRequire } from "module";
import { spawn } from "child_process";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [, , ffmpeg, html, mix, out, fps = "30", only] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await p.goto("file://" + html);
await p.evaluate(async () => {
  await document.fonts.ready;
  const vp = document.getElementById("player");
  Object.assign(vp.style, { position: "fixed", left: 0, top: 0, width: "1920px", height: "1080px", margin: 0, zIndex: 99999, borderRadius: 0 });
  document.getElementById("burn").style.display = "none";
  document.getElementById("cap").style.display = "none";
});
await p.waitForTimeout(800);
const shot = async (t) => {
  await p.evaluate((t) => window.__render.seek(t), t);
  return p.screenshot({ type: "jpeg", quality: 95, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
};

if (only) { // stills: comma-separated seconds
  const fs = await import("fs");
  for (const t of only.split(",")) fs.writeFileSync(`${out}-${t}.jpg`, await shot(+t));
  await b.close(); process.exit(0);
}

const total = await p.evaluate(() => window.__render.total);
const n = Math.round(total * fps);
const ff = spawn(ffmpeg, ["-y", "-f", "image2pipe", "-framerate", fps, "-c:v", "mjpeg", "-i", "-", "-i", mix,
  "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-vf", "scale=out_range=tv:out_color_matrix=bt709,format=yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
  "-tune", "animation", "-c:a", "copy", "-shortest", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
for (let f = 0; f < n; f++) {
  const buf = await shot(Math.min(f / fps, total - 0.001));
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 300 === 0) console.log(`frame ${f}/${n}`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await b.close();
