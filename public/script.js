async function downloadVideo() {
    const url = document.getElementById('urlInput').value;
    const output = document.getElementById('output');
    output.innerHTML = "Processing...";

    const res = await fetch('/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (data.download) {
        output.innerHTML = `<a href="${data.download}" download>Click to Download</a>`;
    } else {
        output.innerHTML = "Failed to fetch video.";
    }
}
