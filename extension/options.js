const autoConfig = document.querySelector("#auto-config");
const state = document.querySelector("#state");
const port = document.querySelector("#port");
const error = document.querySelector("#error");

function statusText(value) {
  switch (value) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting…";
    case "disconnected":
      return "Disconnected";
    default:
      return "Not configured";
  }
}

function autoConfigText(value) {
  switch (value) {
    case "native":
      return "Auto-detected (Native Messaging)";
    case "cached":
      return "Using local cache";
    default:
      return "No local bridge component detected. Run `npm run setup` in the project directory.";
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
