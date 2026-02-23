const out = document.getElementById("out");
const meta = document.getElementById("meta");
const go = document.getElementById("go");
const kw = document.getElementById("kw");
const mode = document.getElementById("mode");
const upgrade = document.getElementById("upgrade");
const copyBtn = document.getElementById("copy");
const copyStatus = document.getElementById("copystatus");


copyBtn.addEventListener("click", async () => {
  try {
    const text = out.textContent || "";
    if (!text.trim() || text.trim() === "Working...") {
      copyStatus.textContent = "Nothing to copy yet.";
      return;
    }

    await navigator.clipboard.writeText(text);
    copyStatus.textContent = "Copied ✅";
    setTimeout(() => (copyStatus.textContent = ""), 1200);
  } catch (err) {
    copyStatus.textContent = "Copy failed — select text and copy manually.";
  }
});



function setOutput(msg) {
  out.textContent = msg;
}

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

async function postJsonWithTimeout(url, body, timeoutMs = 20000) {
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

async function runSummarise() {
  try {
    setOutput("Working...");
    copyStatus.textContent = "";
    meta.textContent = "";
    upgrade.style.display = "none";

    const text = (await getSelectedText()).trim();
    if (!text) {
      setOutput("No selection saved yet.\n\nHighlight text on a webpage → right-click → Go iliterate.");
      return;
    }

    const userId = await getOrCreateUserId();

    const { resp, data } = await postJsonWithTimeout(
      "http://localhost:3000/summarize",
      {
        text,
        keyword: kw.value || "",
        mode: mode.value || "essay",
        userId,
      }
    );

    if (!resp.ok) {
      if (data?.error === "LIMIT_REACHED") {
        setOutput(`Free limit reached (${data.limit}/month).`);
        upgrade.style.display = "inline-block";
        return;
      }
      setOutput(`Error: ${data?.error || resp.statusText || "Unknown error"}`);
      return;
    }

    setOutput(data.summary || "No summary returned.");
    meta.textContent = `Saved selection length: ${text.length} chars • User: ${userId.slice(0, 8)}…`;
  } catch (err) {
    if (err?.name === "AbortError") setOutput("Timed out. Is your server running on localhost:3000?");
    else setOutput(`App error: ${err?.message || String(err)}`);
  }
}

go.addEventListener("click", runSummarise);

// Auto-run when the tab opens
runSummarise();

upgrade.addEventListener("click", async () => {
  try {
    const userId = await getOrCreateUserId();
    setOutput("Opening checkout...");

    const { resp, data } = await postJsonWithTimeout(
      "http://localhost:3000/create-checkout-session",
      { userId },
      20000
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
