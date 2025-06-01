document.getElementById('downloadBtn').addEventListener('click', async () => {
  const videoUrl = document.getElementById('videoUrl').value.trim();
  const videoContainer = document.getElementById('videoContainer');
  videoContainer.innerHTML = 'Processing...';

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: videoUrl })
    });

    const data = await response.json();

    if (data.success && data.downloadUrl) {
      videoContainer.innerHTML = `
        <video width="100%" controls>
          <source src="${data.downloadUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <br/>
        <a href="${data.downloadUrl}" download>
          <button>Download Video</button>
        </a>
      `;
    } else {
      videoContainer.innerHTML = `<p>Error: ${data.message}</p>`;
    }
  } catch (error) {
    videoContainer.innerHTML = `<p>Error: ${error.message}</p>`;
  }
});
