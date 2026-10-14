import { upload } from "@vercel/blob/client";

const form = document.querySelector("#intake");
const thanks = document.querySelector("#thanks");
const missing = document.querySelector("#missing-payment");
const detail = document.querySelector("#thanks-detail");
const status = document.querySelector("#form-status");
const submit = document.querySelector("#intake-submit");
const uploadNote = document.querySelector("#upload-note");
const fileInput = document.querySelector("#photos");
const sessionId = new URLSearchParams(window.location.search).get("session_id") || "";

function setStatus(message) {
  status.textContent = message || "";
}

function showMissing(message) {
  missing.hidden = false;
  thanks.hidden = true;
  const copy = missing.querySelector("p");
  if (message && copy) copy.textContent = message;
}

function safeName(name) {
  const base = String(name || "photo").split(/[/\\]/).pop();
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80);
  return cleaned || "photo";
}

function contentTypeFor(file) {
  if (file.type) return file.type;
  const ext = safeName(file.name).split(".").pop().toLowerCase();
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
  }[ext] || "";
}

async function loadOrder() {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    showMissing("This page opens after a completed payment. Pick a package to start checkout.");
    return;
  }
  setStatus("Confirming your payment…");
  let response;
  try {
    response = await fetch("/api/order?session_id=" + encodeURIComponent(sessionId));
  } catch {
    showMissing("We couldn't reach the payment check. Refresh this page in a moment.");
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showMissing(data.message || "We couldn't find a completed payment for this link.");
    return;
  }
  missing.hidden = true;
  thanks.hidden = false;
  detail.textContent = `You're confirmed for ${data.packageName} (${data.amountLabel}). Send the photos you want us to work from.`;
  form.elements.name.value = data.name || "";
  form.elements.email.value = data.email || "";
  form.elements.businessName.value = data.businessName || "";
  form.elements.notes.value = data.notes || "";
  if (!data.uploadsEnabled) {
    uploadNote.hidden = false;
    uploadNote.textContent = `${data.uploadMessage} Order reference: ${data.sessionId}`;
    fileInput.disabled = true;
    submit.disabled = true;
  } else if (data.submitted) {
    uploadNote.hidden = false;
    uploadNote.textContent = `We already have ${data.photoCount} photo${data.photoCount === 1 ? "" : "s"}. You can send another set if you need to replace them.`;
  }
  setStatus("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const files = Array.from(fileInput.files || []);
  if (!files.length) {
    setStatus("Add at least one photo.");
    return;
  }
  if (files.length > 24) {
    setStatus("Upload up to 24 photos.");
    return;
  }
  const tooBig = files.find((file) => file.size > 20 * 1024 * 1024);
  if (tooBig) {
    setStatus("Each photo needs to be 20 MB or smaller.");
    return;
  }
  submit.disabled = true;
  try {
    const configResponse = await fetch("/api/upload");
    const config = await configResponse.json().catch(() => ({}));
    if (!configResponse.ok || !config.enabled) {
      setStatus(config.message || "Photo upload isn't connected yet.");
      submit.disabled = false;
      return;
    }
    const photos = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setStatus(`Uploading photo ${index + 1} of ${files.length}…`);
      const contentType = contentTypeFor(file);
      if (!contentType) {
        setStatus("Use a JPG, PNG, WEBP, GIF, or HEIC photo.");
        submit.disabled = false;
        return;
      }
      const blob = await upload(`orders/${sessionId}/${safeName(file.name)}`, file, {
        access: config.access === "public" ? "public" : "private",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ sessionId }),
        contentType,
        multipart: file.size > 4.5 * 1024 * 1024,
      });
      photos.push({
        pathname: blob.pathname,
        contentType: blob.contentType || file.type || "",
        size: file.size,
      });
    }
    setStatus("Saving your details…");
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        name: form.elements.name.value,
        email: form.elements.email.value,
        businessName: form.elements.businessName.value,
        notes: form.elements.notes.value,
        photos,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.message || "We couldn't save your photos. Please try again.");
      submit.disabled = false;
      return;
    }
    form.hidden = true;
    uploadNote.hidden = false;
    uploadNote.textContent = `Thanks, ${data.name}. We have ${data.photoCount} photo${data.photoCount === 1 ? "" : "s"} for ${data.businessName}. We'll start from these.`;
    setStatus("");
  } catch (error) {
    setStatus(error?.message || "Upload didn't finish. Please try again.");
    submit.disabled = false;
  }
});

loadOrder();
