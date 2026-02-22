# Gemini Live Transcription

A real-time speech-to-text transcription application using Google's Gemini Live API. This application captures microphone input, streams it to Gemini, and displays live transcription with optional audio responses.

## Features

- 🎤 **Real-time Transcription** - Live speech-to-text with timestamps
- 🔊 **Audio Responses** - AI can respond with synthesized speech
- 📊 **Voice Activity Indicator** - Visual feedback when speaking
- 📥 **Export Functionality** - Download transcription as TXT or JSON
- 🌙 **Dark Mode Support** - Automatic theme based on system preference
- 📱 **Responsive Design** - Works on desktop and mobile devices

## Prerequisites

- Node.js 18 or higher
- A Google AI API key ([Get one here](https://aistudio.google.com/app/apikey))
- A modern web browser with microphone access

## Installation

1. Clone or download this project:
   ```bash
   cd gemini-live-transcription
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the parent directory with your Google API key:
   ```
   GOOGLE_API_KEY=your_api_key_here
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. Click "Start Recording" to begin transcription

4. Speak into your microphone - your speech will be transcribed in real-time

5. Click "Stop Recording" when finished

6. Use the export buttons to download your transcription

## Project Structure

```
gemini-live-transcription/
├── package.json          # Project dependencies
├── server.js             # Node.js backend server
├── public/
│   ├── index.html        # Main HTML page
│   ├── styles.css        # CSS styles
│   └── app.js            # Frontend JavaScript
└── README.md             # This file
```

## API Configuration

### Available Models

- `gemini-2.0-flash-exp` - Latest experimental model with live capabilities
- `gemini-1.5-pro` - Stable model with multimodal support

### Audio Format

- Input: PCM audio at 16kHz sample rate
- Output: PCM audio at 24kHz sample rate

## Troubleshooting

### Microphone Not Working

1. Ensure you've granted microphone permissions in your browser
2. Check that you're using HTTPS (required for microphone access in production)
3. Try a different browser (Chrome recommended)

### Connection Issues

1. Verify your API key is correct
2. Check your internet connection
3. Ensure the server is running

### No Transcription Appearing

1. Speak clearly and at a normal pace
2. Check the status indicator shows "Connected"
3. Verify your microphone is working in other applications

## Browser Support

- Chrome 80+ (recommended)
- Firefox 75+
- Safari 14+
- Edge 80+

## Security Notes

- Your API key is stored server-side and never exposed to the client
- Audio data is streamed in real-time and not stored permanently
- Use HTTPS in production for secure microphone access

## License

MIT License - feel free to use this project for any purpose.

## Resources

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Gemini Live API Guide](https://ai.google.dev/gemini-api/docs/live-guide)
- [Get an API Key](https://aistudio.google.com/app/apikey)
