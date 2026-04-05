const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.whenReady().then(() => {
  const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 1024,
      minHeight: 600,
      show: false, // prevent white flash
      useContentSize: true,
      webPreferences: {
        contextIsolation: true,
        sandbox: true, // modern Electron security standard
        preload: path.join(__dirname, 'preload_dummy.cjs')
      },
  });
  win.once('ready-to-show', () => {
      console.log('ready-to-show fired');
      win.maximize();
      win.show();
  });
  win.loadFile('index.html').then(() => {
    console.log('HELLO ELECTRON WINDOW!');
    win.close();
  });
});
