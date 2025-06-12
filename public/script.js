async function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const quality = document.getElementById('quality').value;
    const statusDiv = document.getElementById('status');
    
    statusDiv.innerHTML = '<div class="loading">Starting download...</div>';
    
    try {
        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: videoUrl,
                quality: quality || 'best'
            })
        });

        // Check for errors
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Download failed');
        }

        const data = await response.json();
        
        if (data.downloadUrl) {
            // For TikTok/Instagram/Facebook - direct download
            statusDiv.innerHTML = '<div class="success">Video ready!</div>';
            const directLink = document.createElement('a');
            directLink.href = data.downloadUrl;
            directLink.className = 'download-link';
            directLink.textContent = 'Click to download';
            directLink.target = '_blank';
            statusDiv.appendChild(directLink);
        } else if (data.filename) {
            // For YouTube - server download
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
        statusDiv.innerHTML = `<div class="error">Error: ${error.message.replace('Error:', '').trim()}</div>`;
    }
                   }
