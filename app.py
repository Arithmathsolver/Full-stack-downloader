from flask import Flask, request, jsonify, send_from_directory
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError
import os
from flask_cors import CORS  # Add this import

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure download folder
DOWNLOAD_FOLDER = os.path.abspath('downloads')
if not os.path.exists(DOWNLOAD_FOLDER):
    os.makedirs(DOWNLOAD_FOLDER)

@app.route('/download', methods=['POST'])
def download_video():
    try:
        url = request.form['url']
        
        ydl_opts = {
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': os.path.join(DOWNLOAD_FOLDER, '%(title)s.%(ext)s'),
            'quiet': True,
        }

        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
        return jsonify({
            'status': 'success',
            'filename': os.path.basename(filename)
        })

    except DownloadError as e:
        return jsonify({'status': 'error', 'message': f"YouTube download error: {str(e)}"}), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': f"Server error: {str(e)}"}), 500

@app.route('/downloads/<filename>')
def download_file(filename):
    return send_from_directory(DOWNLOAD_FOLDER, filename, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True)
