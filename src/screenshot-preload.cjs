const { contextBridge, ipcRenderer } = require('electron');

function pickerToken() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

contextBridge.exposeInMainWorld('screenshotPicker', {
  complete: (rect) => ipcRenderer.send(`screenshot-region:selected:${pickerToken()}`, rect),
  cancel: () => ipcRenderer.send(`screenshot-region:canceled:${pickerToken()}`)
});
