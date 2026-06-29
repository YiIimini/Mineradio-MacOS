// Render DMG background HTML → PNG using Electron
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 658,
    height: 498,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#010304',
    webPreferences: { offscreen: true },
  });

  const htmlPath = path.join(__dirname, 'dmg-background.html');
  await win.loadFile(htmlPath);

  // Wait for fonts and rendering
  await new Promise(r => setTimeout(r, 2000));

  const image = await win.webContents.capturePage();
  const pngPath = path.join(__dirname, 'dmg-background.png');
  fs.writeFileSync(pngPath, image.toPNG());

  console.log('✓ DMG background rendered:', pngPath);
  app.quit();
});
