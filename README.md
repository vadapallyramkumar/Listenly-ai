# Listenly-ai

Turn pasted text or a PDF into natural speech and download one MP3.

Speech uses Microsoft Edge neural voices through a local API, so generating audio needs an internet connection. There is no paid API key.

## Setup (Windows PowerShell)

From this folder:

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm install
npm install --prefix frontend
npm run dev
```

Open http://localhost:5173.

Use the Text tab to paste text, or the PDF tab to drop a file up to 20 MB. Choose a voice and speed, then generate. Playback and **Download MP3** appear when the file is ready. The gear turns on autoplay for the next generation.

Text longer than about 2,500 characters is spoken in parts and joined into one MP3. The limit is 40,000 characters. Scanned PDFs with no text layer cannot be read.
