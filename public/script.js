async function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const quality = document.getElementById('quality').value;
    const statusDiv = document.getElementById('status');

    // Clear previous messages
    statusDiv.innerHTML = '<div class="loading">Starting download...</div>';

    try {
        const payload = { url: videoUrl };

        // Add quality only for YouTube
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
            payload.quality = quality || 'best';
        }

        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        // Check for HTTP errors
        if (!response.ok) {
            const errorData = await response.json();

            // Special handling for rate limiting
            if (response.status === 429) {
                throw new Error(`
                    YouTube has temporarily blocked our requests.<br><br>
                    Please try:<br>
                    1. Waiting 1–2 hours<br>
                    2. Using a different network/VPN<br>
                    3. Using the official YouTube app instead
                `);
            }

            throw new Error(errorData.message || `Download failed (status ${response.status})`);
        }

        const data = await response.json();

        if (data.downloadUrl) {
            // For TikTok/Instagram/Facebook
            statusDiv.innerHTML = '<div class="success">Video ready!</div>';
            const directLink = document.createElement('a');
            directLink.href = data.downloadUrl;
            directLink.className = 'download-link';
            directLink.textContent = 'Click to download';
            directLink.target = '_blank';
            statusDiv.appendChild(directLink);
        } else if (data.filename) {
            // For YouTube
            statusDiv.innerHTML = '<div class="success">Processing video...</div>';

            const downloadLink = document.createElement('a');
            downloadLink.href = `/downloads/${encodeURIComponent(data.filename)}`;
            downloadLink.className = 'download-link';
            downloadLink.textContent = 'Click to download';
            downloadLink.download = true;

            statusDiv.innerHTML = '<div class="success">Download ready!</div>';
            statusDiv.appendChild(document.createElement('br'));
            statusDiv.appendChild(downloadLink);
        } else {
            throw new Error('No download URL or filename received');
        }

    } catch (error) {
        console.error('Download error:', error);
        statusDiv.innerHTML = `
            <div class="error">
                <strong>Error:</strong><br>
                ${error.message.replace('Error:', '').trim()}
            </div>
        `;
    }
}
