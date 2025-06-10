async function downloadVideo() {
  const url = document.getElementById('videoUrl').value;
  const quality = document.getElementById('quality').value;
  const status = document.getElementById('status');

  if (!url) {
    status.innerHTML = "❌ Please paste a video URL.";
    return;
  }

  status.innerHTML = "⏳ Processing... Please wait.";

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: url, quality })
    });

    const data = await res.json();

    if (data.success && data.downloadUrl) {
      status.innerHTML = `<a href="${data.downloadUrl}" target="_blank" download>✅ Click here to download your video</a>`;
    } else {
      status.innerHTML = `❌ ${data.message || "Unable to fetch download link."}`;
    }
  } catch (err) {
    console.error(err);
    status.innerHTML = "❌ Server error.";
  }
}
