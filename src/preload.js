const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dynamacStatus", {
  read: () => ipcRenderer.invoke("status:read"),
  onUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("status:update", listener);
    return () => ipcRenderer.removeListener("status:update", listener);
  }
});
