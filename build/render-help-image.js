// Render gesture help diagram to PNG using Electron headless
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 640, height: 500,
    show: false,
    webPreferences: { offscreen: true, nodeIntegration: false, sandbox: true }
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:620px;height:470px;background:#0d1117;font:12px/1.4 "PingFang SC","Microsoft YaHei","SF Mono",monospace;color:#b4b9c3;display:flex;flex-direction:column;align-items:center;padding:20px 30px}
.g{color:#5cdb9b}.b{color:#5ea3f0}.y{color:#f4d28a}.d{color:#646b75}
.row{display:flex;align-items:center;justify-content:center;gap:8px;margin:3px 0}
.box{border:1px solid;border-radius:6px;padding:5px 14px;text-align:center;background:rgba(255,255,255,0.03)}
.box .t{font-weight:bold;font-size:12px}.box .s{font-size:10px;opacity:0.7}
.vline{width:0;height:12px;border-left:1px solid #3a3d42}
.hline{height:0;border-top:1px solid #3a3d42}
.split{display:flex;gap:40px;align-items:flex-start;margin:6px 0}
.col{display:flex;flex-direction:column;align-items:center;gap:4px}
.triple{display:flex;gap:20px;margin:4px 0}
.foot{font-size:11px;color:#888;margin-top:6px}
</style></head><body>
<div class="row d">摄像头 30fps → MediaPipe Hands → 21个关键点 (x,y,z)</div>
<div class="vline"></div>
<div class="box"><span class="t d">EMA 平滑滤波 (α=0.35)</span></div>
<div class="vline"></div>
<div class="box"><span class="t">手掌中心 + handOpenness()</span></div>
<div class="vline"></div>
<div class="split" style="margin-top:2px">
  <div class="col"><div class="hline" style="width:60px"></div><div class="box g"><span class="t">cam=gesture</span><span class="s">视觉手势</span></div><div class="vline"></div><span class="d" style="font-size:10px">捏合检测 / 握拳张开</span><span class="d" style="font-size:10px">旋转封面 / 推开收束粒子</span></div>
  <div class="col"><div class="hline" style="width:60px"></div><div class="box b"><span class="t">cam=playback</span><span class="s">手势控歌</span></div><div class="vline"></div><span style="font-size:10px">openness → tier 映射</span></div>
</div>
<div class="vline"></div>
<div class="triple">
  <div class="box g"><span class="t">&lt; T1</span><span class="s">拳头 · 播放</span></div>
  <div class="box b"><span class="t">T1 ~ T2</span><span class="s">食指 · 下一首</span></div>
  <div class="box y"><span class="t">&gt; T3</span><span class="s">手掌 · 暂停</span></div>
</div>
<div class="vline"></div>
<div class="box y"><span class="t">迟滞过滤器 (防边界抖动)</span></div>
<div class="vline"></div>
<span>保持手势至设定时间 → 触发动作</span>
<span class="foot d">冷却间隔防误触 · 阈值/时间/冷却可在下方滑块调整</span>
</body></html>`;

  // Use data URL to avoid file I/O
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  await win.loadURL(dataUrl);

  // Wait for fonts to render
  await new Promise(r => setTimeout(r, 800));

  const image = await win.webContents.capturePage();
  const png = image.toPNG();

  const outPath = path.join(__dirname, '..', 'public', 'gesture-help.png');
  fs.writeFileSync(outPath, png);
  console.log('Saved:', outPath, '(' + png.length + ' bytes)');

  app.quit();
}).catch(e => { console.error(e); app.exit(1); });
