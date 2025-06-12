from flask import Flask, request, jsonify, send_from_directory
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError
import os
from flask_cors import CORS
import traceback

app = Flask(__name__)
CORS(app)

# Configure download folder
DOWNLOAD_FOLDER = os.path.abspath('downloads')
if not os.path.exists(DOWNLOAD_FOLDER):
    os.makedirs(DOWNLOAD_FOLDER)

@app.route('/download', methods=['POST'])
def download_video():
    try:
        if 'url' not in request.form:
            return jsonify({'status': 'error', 'message': 'URL parameter missing'}), 400
            
        url = request.form['url'].strip()
        if not url:
            return jsonify({'status': 'error', 'message': 'URL cannot be empty'}), 400
        
        ydl_opts = {
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': os.path.join(DOWNLOAD_FOLDER, '%(title)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': False,
        }

        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
        return jsonify({
            'status': 'success',
            'filename': os.path.basename(filename)
        })

    except DownloadError as e:
        app.logger.error(f"YouTube DL error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Download failed: {str(e)}"
        }), 400
    except Exception as e:
        app.logger.error(f"Server error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            'status': 'error',
            'message': f"Server error: {str(e)}"
        }), 500

@app.route('/downloads/<path:filename>')
def download_file(filename):
    try:
        return send_from_directory(
            DOWNLOAD_FOLDER,
            filename,
            as_attachment=True,
            mimetype='video/mp4'
        )
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f"File download failed: {str(e)}"
        }), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
