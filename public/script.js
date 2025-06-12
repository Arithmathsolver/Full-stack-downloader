async function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const quality = document.getElementById('quality').value;
    const statusDiv = document.getElementById('status');
    
    statusDiv.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <div>Initializing download system...</div>
            <small>Trying multiple methods if needed</small>
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
                quality: quality || 'best'
            })
        });

        // Check for HTTP errors
        if (!response.ok) {
            const errorData = await response.json();
            
            // Enhanced error handling for different scenarios
            if (response.status === 429) {
                throw new Error(`
                    <strong>YouTube Rate Limit Reached</strong><br><br>
                    Our servers are temporarily restricted by YouTube.<br>
                    Solutions:<br>
                    1. Wait 30-60 minutes<br>
                    2. Try a different network/VPN<br>
                    3. Use cookies for authentication<br>
                    4. Try a different video
                `);
            } else if (response.status === 500) {
                throw new Error(`
                    <strong>Server Processing Error</strong><br><br>
                    ${errorData.message || 'All download methods failed'}<br>
                    Our system tried multiple approaches but couldn't download the video.
                `);
            }
            
            throw new Error(errorData.message || `Download failed (status ${response.status})`);
        }

        const data = await response.json();
        
        if (data.downloadUrl) {
            // For direct download links (TikTok/Instagram/Facebook/3rd-party YouTube)
            statusDiv.innerHTML = `
                <div class="success">
                    <svg>✓</svg>
                    <div>Download Ready!</div>
                    <small>${data.message || 'Via secure connection'}</small>
                </div>
                <a href="${data.downloadUrl}" 
                   class="download-btn" 
                   download
                   onclick="this.innerHTML='Downloading...';setTimeout(()=>window.location.reload(),3000)">
                    Download Now
                </a>
            `;
        } else if (data.filename) {
            // For server-hosted YouTube downloads
            statusDiv.innerHTML = `
                <div class="success">
                    <svg>✓</svg>
                    <div>Processing Complete!</div>
                    <small>Video converted and ready</small>
                </div>
                <a href="/downloads/${encodeURIComponent(data.filename)}" 
                   class="download-btn"
                   onclick="this.innerHTML='Saving...';setTimeout(()=>window.location.reload(),3000)">
                    Save Video File
                </a>
            `;
        } else {
            throw new Error('Invalid server response format');
        }
        
    } catch (error) {
        console.error('Download error:', error);
        statusDiv.innerHTML = `
            <div class="error">
                <svg>✗</svg>
                <div>${error.message.replace('Error:', '').replace('Error', '').trim()}</div>
                ${error.message.includes('YouTube') ? `
                <div class="error-tips">
                    <strong>Quick Fixes:</strong>
                    <ul>
                        <li>Try a shorter URL (remove ?si= parameters)</li>
                        <li>Wait 5 minutes and retry</li>
                        <li>Use a different network connection</li>
                        <li>Try with a VPN if available</li>
                    </ul>
                </div>
                ` : ''}
            </div>
        `;
    }
}

// Add to your CSS:
/*
.loading, .success, .error {
    padding: 15px;
    border-radius: 8px;
    margin: 10px 0;
}
.loading {
    background: #e3f2fd;
    color: #0d47a1;
}
.success {
    background: #e8f5e9;
    color: #2e7d32;
}
.error {
    background: #ffebee;
    color: #c62828;
}
.download-btn {
    display: block;
    margin-top: 15px;
    padding: 10px 15px;
    background: #2196f3;
    color: white;
    text-align: center;
    border-radius: 5px;
    text-decoration: none;
}
.error-tips {
    margin-top: 10px;
    padding: 10px;
    background: #fff3e0;
    border-radius: 5px;
    font-size: 0.9em;
}
.spinner {
    border: 3px solid rgba(0,0,0,0.1);
    border-radius: 50%;
    border-top: 3px solid #0d47a1;
    width: 20px;
    height: 20px;
    animation: spin 1s linear infinite;
    margin: 0 auto 10px;
}
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
*/
