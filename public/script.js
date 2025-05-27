async function downloadVideo() {
  const url = document.getElementById("videoUrl").value;
  const status = document.getElementById("status");
  const downloadLink = document.getElementById("downloadLink");

  if (!url) {
    status.textContent = "Please paste a link.";
    return;
  }

  status.textContent = "Processing... Please wait.";
  downloadLink.style.display = "none";

  let platform = "";
  if (url.includes("youtube.com") || url.includes("youtu.be")) platform = "youtube";
  else if (url.includes("tiktok.com")) platform = "tiktok";
  else if (url.includes("instagram.com")) platform = "instagram";
  else if (url.includes("facebook.com")) platform = "facebook";
  else {
    status.textContent = "Unsupported platform.";
    return;
  }

  try {
    const response = await fetch(`/api/${platform}?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (data.url) {
      status.textContent = "Ready to download:";
      downloadLink.href = data.url;
      downloadLink.style.display = "inline-block";
      downloadLink.click(); // triggers download
    } else {
      status.textContent = "Download link not found.";
    }
  } catch (err) {
    status.textContent = "Download failed. Try again.";
  }
          }
