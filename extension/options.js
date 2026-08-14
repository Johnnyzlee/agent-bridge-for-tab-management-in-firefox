const autoConfig = document.querySelector("#auto-config");
const state = document.querySelector("#state");
const port = document.querySelector("#port");
const error = document.querySelector("#error");

function statusText(value) {
  switch (value) {
    case "connected":
      return "已连接";
    case "connecting":
      return "连接中……";
    case "disconnected":
      return "已断开";
    default:
      return "未配置";
  }
}

function autoConfigText(value) {
  switch (value) {
    case "native":
      return "已自动获取（Native Messaging）";
    case "cached":
      return "使用本地缓存";
    default:
      return "未检测到本地桥接组件，请在项目目录运行 npm run setup。";
  }
}

async function refreshStatus() {
  try {
    const result = await browser.runtime.sendMessage({ type: "bridge_status" });
    autoConfig.textContent = autoConfigText(result.autoConfig);
    state.textContent = statusText(result.state);
    port.textContent = result.port ?? "—";
    error.textContent = result.lastError || "—";
  } catch (errorValue) {
    state.textContent = String(errorValue);
  }
}

document.querySelector("#reconnect").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "bridge_reconnect" });
  setTimeout(() => void refreshStatus(), 300);
});

document.querySelector("#redetect").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "bridge_redetect" });
  setTimeout(() => void refreshStatus(), 300);
});

void refreshStatus();
