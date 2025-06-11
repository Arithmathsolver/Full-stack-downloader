async function downloadVideo() {
    const videoUrl = document.getElementById('videoUrl').value.trim();
    const statusDiv = document.getElementById('status');
    
    if (!videoUrl) {
        statusDiv.innerHTML = 'Please enter a YouTube URL';
        return;
    }

    statusDiv.innerHTML = 'Downloading...';
    
    try {
        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `url=${encodeURIComponent(videoUrl)}`
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Download failed');
        }
        
        statusDiv.innerHTML = 'Download complete!';
        
        // Create download link
        const downloadLink = document.createElement('a');
        downloadLink.href = `/downloads/${encodeURIComponent(data.filename)}`;
        downloadLink.download = true;
        downloadLink.innerHTML = 'Click to save video';
        statusDiv.appendChild(document.createElement('br'));
        statusDiv.appendChild(downloadLink);
        
    } catch (error) {
        console.error('Error:', error);
        statusDiv.innerHTML = `Error: ${error.message}`;
    }
    }
