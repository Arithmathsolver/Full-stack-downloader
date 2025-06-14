from flask import Flask, request, jsonify, send_from_directory
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError
import os
import logging
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)

# Configure download folder
DOWNLOAD_FOLDER = os.path.abspath('downloads')
if not os.path.exists(DOWNLOAD_FOLDER):
    os.makedirs(DOWNLOAD_FOLDER)

@app.route('/download', methods=['POST'])
def download_video():
    try:
        app.logger.info("Received download request")
        
        if 'url' not in request.form:
            app.logger.error("No URL provided")
            return jsonify({
                'status': 'error',
                'message': 'YouTube URL is required'
            }), 400

        url = request.form['url'].strip()
        if not url:
            app.logger.error("Empty URL provided")
            return jsonify({
                'status': 'error',
                'message': 'YouTube URL cannot be empty'
            }), 400

        app.logger.info(f"Attempting to download: {url}")
        
        ydl_opts = {
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': os.path.join(DOWNLOAD_FOLDER, '%(title)s.%(ext)s'),
            'quiet': False,
            'no_warnings': False,
            'ignoreerrors': False,
        }

        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            app.logger.info(f"Download completed: {filename}")
            
        return jsonify({
            'status': 'success',
            'filename': os.path.basename(filename)
        })

    except DownloadError as e:
        app.logger.error(f"YouTube Download Error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"YouTube error: {str(e)}"
        }), 400
        
    except Exception as e:
        app.logger.error(f"Unexpected Error: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f"Server error: Please check the URL and try again"
        }), 500

@app.route('/downloads/<filename>')
def download_file(filename):
    try:
        return send_from_directory(
            DOWNLOAD_FOLDER,
            filename,
            as_attachment=True,
            mimetype='video/mp4'
        )
    except FileNotFoundError:
        return jsonify({
            'status': 'error',
            'message': 'File not found. Please try downloading again.'
        }), 404
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f"Download failed: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
