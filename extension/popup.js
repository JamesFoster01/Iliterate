const out = document.getElementById("out");
const go = document.getElementById("go");
const kw = document.getElementById("kw");
const mode = document.getElementById("mode");
const upgrade = document.getElementById("upgrade"); // may be null if not added yet

async function getSelectedText() {
  const data = await chrome.storage.local.get("iliterate_selectedText");
  return data.iliterate_selectedText || "";
}

async function getOrCreateUserId() {
  const data = await chrome.storage.local.get("iliterate_userId");
  if (data.iliterate_userId) return data.iliterate_userId;

  const newId =
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
      ? globalThis.crypto.randomUUID()
      : `il_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  await chrome.storage.local.set({ iliterate_userId: newId });
  return newId;
}

function setOutput(msg) {
  out.textContent = msg;
}

async function postJsonWithTimeout(url, body, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await resp.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || "Non-JSON response" };
    }

    return { resp, data };
  } finally {
    clearTimeout(t);
  }
}

go.addEventListener("click", async () => {
  try {
    setOutput("Working...");
    if (upgrade) upgrade.style.display = "none";

    // Clear badge (don’t let this crash the flow)
    try {
      chrome.action.setBadgeText({ text: "" });
    } catch {}

    const text = (await getSelectedText()).trim();
    if (!text) {
      setOutput("Select text on a webpage, then right-click → Go iliterate.");
      return;
    }

    const userId = await getOrCreateUserId();

    const { resp, data } = await postJsonWithTimeout(
      "http://localhost:3000/summarize",
      {
        text,
        keyword: kw?.value || "",
        mode: mode?.value || "essay",
        userId,
      }
    );

    if (!resp.ok) {
      if (data?.error === "LIMIT_REACHED") {
        setOutput(`Free limit reached (${data.limit}/month).`);
        if (upgrade) upgrade.style.display = "block";
        return;
      }
      setOutput(`Error: ${data?.error || resp.statusText || "Unknown error"}`);
      return;
    }

    setOutput(data.summary || "No summary returned.");
  } catch (err) {
    // This ensures you never get stuck on “Working...”
    if (err?.name === "AbortError") {
      setOutput("Timed out. Is the server running on localhost:3000?");
    } else {
      setOutput(`Popup error: ${err?.message || String(err)}`);
    }
  }
});

upgrade?.addEventListener("click", async () => {
  try {
    const userId = await getOrCreateUserId();
    setOutput("Opening checkout...");

    const { resp, data } = await postJsonWithTimeout(
      "http://localhost:3000/create-checkout-session",
      { userId },
      15000
    );

    if (!resp.ok || !data?.url) {
      setOutput(`Checkout error: ${data?.error || "Unknown error"}`);
      return;
    }

    window.open(data.url, "_blank");
  } catch (err) {
    setOutput(`Checkout error: ${err?.message || String(err)}`);
  }
});

