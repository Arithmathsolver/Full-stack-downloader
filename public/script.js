document.getElementById('downloadBtn').addEventListener('click', async () => {
  const videoUrl = document.getElementById('videoUrl').value;
  const message = document.getElementById('message');
  const downloadLink = document.getElementById('downloadLink');

  if (!videoUrl.trim()) {
    message.textContent = 'Please paste a valid video URL.';
    return;
  }

  message.textContent = 'Processing... Please wait.';
  downloadLink.hidden = true;

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl })
    });

    const data = await res.json();

    if (data.success) {
      downloadLink.href = data.downloadUrl;
      downloadLink.hidden = false;
      message.textContent = 'Download ready:';
    } else {
      message.textContent = data.message;
    }
  } catch (error) {
    message.textContent = 'Error contacting server.';
    console.error(error);
  }
});
