const portInput = document.querySelector("#port");
const tokenInput = document.querySelector("#token");
const saved = document.querySelector("#saved");
const status = document.querySelector("#status");

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function load() {
  const values = await browser.storage.local.get({ bridgePort: 8765, bridgeToken: "" });
  portInput.value = String(values.bridgePort);
  tokenInput.value = values.bridgeToken;
  await refreshStatus();
}

async function refreshStatus() {
  try {
    const result = await browser.runtime.sendMessage({ type: "bridge_status" });
    status.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    status.textContent = String(error);
  }
}

document.querySelector("#generate").addEventListener("click", () => {
  tokenInput.value = generateToken();
});

document.querySelector("#settings").addEventListener("submit", async (event) => {
  event.preventDefault();
  const bridgePort = Number(portInput.value);
  const bridgeToken = tokenInput.value.trim();
  if (!Number.isInteger(bridgePort) || bridgePort < 1 || bridgePort > 65535 || bridgeToken.length < 16) {
    saved.textContent = "请填写有效端口，以及至少 16 个字符的令牌。";
    return;
  }
  await browser.storage.local.set({ bridgePort, bridgeToken });
  await browser.runtime.sendMessage({ type: "bridge_reconnect" });
  saved.textContent = "已保存。请把同一个令牌配置给 MCP Server。";
  setTimeout(() => void refreshStatus(), 300);
});

document.querySelector("#refresh").addEventListener("click", () => void refreshStatus());
void load();
