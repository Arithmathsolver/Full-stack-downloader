async function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const quality = document.getElementById('quality').value;
    const statusDiv = document.getElementById('status');
    
    statusDiv.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div>Preparing download...</div>
      </div>
    `;
    
    try {
        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: videoUrl,
                quality: quality || '720p'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Download failed');
        }

        const data = await response.json();
        
        if (data.downloadUrl) {
            // For direct download links
            statusDiv.innerHTML = `
              <div class="success">
                <svg>✓</svg>
                <div>Ready to download!</div>
              </div>
              <a href="${data.downloadUrl}" class="download-btn" download>
                Download Now
              </a>
            `;
        } else if (data.filename) {
            // For server-hosted files
            statusDiv.innerHTML = `
              <div class="success">
                <svg>✓</svg>
                <div>Processing complete!</div>
              </div>
              <a href="/downloads/${encodeURIComponent(data.filename)}" class="download-btn">
                Save Video
              </a>
            `;
        }
    } catch (error) {
        statusDiv.innerHTML = `
          <div class="error">
            <svg>✗</svg>
            <div>${error.message.replace('Error:', '').trim()}</div>
            ${error.message.includes('block') ? `
            <div class="error-tips">
              <h4>Quick Fixes:</h4>
              <ul>
                <li>Try a shorter URL (remove ?si= parameters)</li>
                <li>Wait 5 minutes and try again</li>
                <li>Use a different network connection</li>
              </ul>
            </div>
            ` : ''}
          </div>
        `;
    }
}

// Add click event for better mobile support
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('download-btn')) {
    e.target.innerHTML = 'Downloading...';
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  }
});
