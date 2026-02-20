# muscle/ripper.py - The Pirate's Hook
# Robust yt-dlp wrapper for downloading viral content.
# Usage: python ripper.py <URL> [MODE: full|audio]

import sys
import os
import json
import yt_dlp

# --- Configuration ---
BIN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin')
FFMPEG_EXE = os.path.join(BIN_DIR, 'ffmpeg.exe')

if not os.path.exists(FFMPEG_EXE):
    # Fallback to system ffmpeg if local not found
    FFMPEG_EXE = 'ffmpeg'

def download_content(url, mode='full'):
    # Determine format
    if mode == 'audio':
        ydl_format = 'bestaudio/best'
        postprocessors = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]
    else:
        # Best video + best audio
        ydl_format = 'bestvideo+bestaudio/best'
        postprocessors = [{
            'key': 'FFmpegVideoConvertor',
            'preferedformat': 'mp4',
        }]

    # Output template
    # Save to 'loot' directory in parent
    loot_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'loot')
    if not os.path.exists(loot_dir):
        os.makedirs(loot_dir)
        
    output_template = os.path.join(loot_dir, '%(title).50s [%(id)s].%(ext)s')

    options = {
        'format': ydl_format,
        'outtmpl': output_template,
        'postprocessors': postprocessors,
        'ffmpeg_location': FFMPEG_EXE,
        'quiet': True,
        'no_warnings': True,
        'ignoreerrors': True, # Don't crash on playlist errors
        'restrictfilenames': True, # Avoid weird chars
        # Metadata
        'writethumbnail': False, 
        'writeinfojson': False,
    }

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            # First extract info to get metadata
            info = ydl.extract_info(url, download=False)
            
            if not info:
                return {"error": "Could not extract info"}
                
            # Sanity check: is it too long?
            duration = info.get('duration', 0)
            if duration > 600: # > 10 mins
                return {"error": "Video too long (>10 mins). Pirate only takes quick loot."}

            # Download
            error_code = ydl.download([url])
            
            if error_code != 0:
                return {"error": "Download failed"}
                
            # Predict filename
            filename = ydl.prepare_filename(info)
            
            # If audio mode, extension might change to mp3
            if mode == 'audio':
                filename = os.path.splitext(filename)[0] + '.mp3'
            elif mode == 'full':
                # FFmpeg might have converted to mp4
                base, _ = os.path.splitext(filename)
                if os.path.exists(base + '.mp4'):
                    filename = base + '.mp4'
                elif os.path.exists(base + '.mkv'): # fallback
                    filename = base + '.mkv'

            return {
                "success": True,
                "title": info.get('title'),
                "id": info.get('id'),
                "uploader": info.get('uploader'),
                "views": info.get('view_count'),
                "likes": info.get('like_count'),
                "duration": duration,
                "path": filename,
                "url": url
            }

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python ripper.py <URL> [full|audio]"}))
        sys.exit(1)

    url = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else 'full'
    
    result = download_content(url, mode)
    print(json.dumps(result))
