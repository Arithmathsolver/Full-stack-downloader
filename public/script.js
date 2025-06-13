async function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const quality = document.getElementById('quality').value;
    const statusDiv = document.getElementById('status');

    // Clear previous messages with animation
    statusDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Preparing download...</div>';

    // Disable button during download
    const downloadBtn = document.querySelector('button');
    downloadBtn.disabled = true;

    try {
        const payload = {
            url: videoUrl,
            requestId: Date.now().toString(36) + Math.random().toString(36).substring(2)
        };

        // Add quality only for YouTube
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
            payload.quality = quality || '720p';
        }

        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            let errorMessage = errorData.message || `Server error (status ${response.status})`;

            if (response.status === 429) {
                errorMessage = `
                    <strong>Too many requests!</strong><br><br>
                    Try these solutions:<br>
                    1. Wait 15-30 minutes<br>
                    2. Use a VPN<br>
                    3. Try again later<br>
                    <small>${errorData.message || 'YouTube rate limit exceeded'}</small>
                `;
            } else if (response.status === 403) {
                errorMessage = `
                    <strong>Access denied!</strong><br><br>
                    This usually means:<br>
                    1. The video is private/age-restricted<br>
                    2. Our service is temporarily blocked<br>
                    <small>${errorData.message || 'Authentication required'}</small>
                `;
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.downloadUrl) {
            // TikTok, Instagram, Facebook
            updateStatusWithDownloadLink(
                statusDiv,
                data.downloadUrl,
                'Direct download ready!',
                'Download Now'
            );
        } else if (data.filename) {
            // YouTube
            updateStatusWithDownloadLink(
                statusDiv,
                `/downloads/${encodeURIComponent(data.filename)}`,
                'HD download ready!',
                'Save Video',
                true
            );
        } else {
            throw new Error('Unexpected server response format');
        }

    } catch (error) {
        console.error('Download error:', error);
        showError(statusDiv, error.message);
    } finally {
        downloadBtn.disabled = false;
    }
}

function updateStatusWithDownloadLink(container, url, message, linkText, isDownload = false) {
    container.innerHTML = `
        <div class="success">
            <svg class="checkmark" viewBox="0 0 52 52">
                <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
            ${message}
        </div>
    `;

    const link = document.createElement('a');
    link.href = url;
    link.className = 'download-btn';
    link.textContent = linkText;
    link.target = '_blank';
    if (isDownload) link.download = true;

    container.appendChild(document.createElement('br'));
    container.appendChild(link);

    link.addEventListener('click', () => {
        console.log(`Download initiated for ${url}`);
    });
}

function showError(container, message) {
    container.innerHTML = `
        <div class="error">
            <svg class="crossmark" viewBox="0 0 52 52">
                <circle class="crossmark__circle" cx="26" cy="26" r="25" fill="none"/>
                <path class="crossmark__cross" fill="none" d="M16 16 36 36 M36 16 16 36"/>
            </svg>
            ${message}
        </div>
    `;
}
