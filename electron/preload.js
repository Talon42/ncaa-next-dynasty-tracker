import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("dynastyImport", {
  pickFile: () => ipcRenderer.invoke("dynasty:pickFile"),
  exportCsvFromFile: (payload) => ipcRenderer.invoke("dynasty:exportCsv", payload),
});
