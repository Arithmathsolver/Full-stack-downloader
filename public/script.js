function downloadVideo() {
  const url = document.getElementById('videoURL').value;
  if (!url) {
    alert('Please enter a video URL');
    return;
  }

  fetch('http://localhost:5000/api/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  })
  .then(response => response.text())
  .then(data => {
    alert(data);
  })
  .catch(error => {
    console.error('Error:', error);
    alert('Download failed');
  });
}
