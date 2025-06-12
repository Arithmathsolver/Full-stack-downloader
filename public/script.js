async function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const statusDiv = document.getElementById('status');
    
    if (!videoUrl) {
        statusDiv.innerHTML = 'Please enter a YouTube URL';
        return;
    }

    statusDiv.innerHTML = 'Starting download...';
    
    try {
        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `url=${encodeURIComponent(videoUrl)}`
        });

        // First check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const errorText = await response.text();
            throw new Error(`Server returned: ${errorText.substring(0, 100)}`);
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || `Download failed (status ${response.status})`);
        }
        
        statusDiv.innerHTML = 'Processing video...';
        
        // Create download link
        const downloadLink = document.createElement('a');
        downloadLink.href = `/downloads/${encodeURIComponent(data.filename)}`;
        downloadLink.innerHTML = 'Click here to download';
        downloadLink.style.display = 'block';
        downloadLink.style.marginTop = '10px';
        downloadLink.style.color = 'blue';
        downloadLink.style.textDecoration = 'underline';
        
        // Clear previous content and add new
        statusDiv.innerHTML = 'Download ready!';
        statusDiv.appendChild(document.createElement('br'));
        statusDiv.appendChild(downloadLink);
        
    } catch (error) {
        console.error('Download error:', error);
        // Clean error message by removing HTML tags if present
        const cleanError = error.message.replace(/<[^>]*>?/gm, '');
        statusDiv.innerHTML = `Error: ${cleanError}`;
    }
                                                                    }
