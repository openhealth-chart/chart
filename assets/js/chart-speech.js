
let apiKey = null;
export class ChartRecorder{
    constructor(key){
        this.key=key;
        apiKey = key;
        initialize();
    }
initialize() {
const startButton = document.getElementById('start-recognition');
const stopButton = document.getElementById('stop-recognition');
const transcriptTextarea = document.getElementById('transcript');
const debugDiv = document.getElementById('debug');
let mediaRecorder;
let isRecording = false;
let audioChunks = [];
let audioContext;
let audioAnalyzer;
let audioSource;
let silenceTimeout;
let stream;
const silenceDelay = 1200; // 1.2 seconds of silence

startButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);

function startRecording() {
  if (isRecording) return;
  isRecording = true;
  audioChunks = [];

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(str => {
      stream = str;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioAnalyzer = audioContext.createAnalyser();
      audioSource = audioContext.createMediaStreamSource(stream);
      audioSource.connect(audioAnalyzer);
      audioAnalyzer.fftSize = 2048;

      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm; codecs=opus'
      });

      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
        if (debugDiv) debugDiv.innerHTML += `Audio data buffered: ${event.data.size} bytes<br>`;
      };

      mediaRecorder.onstart = () => {
        if (debugDiv) debugDiv.innerHTML += 'MediaRecorder started<br>';
        detectSilence();
      };

      mediaRecorder.onstop = () => {
        if (debugDiv) debugDiv.innerHTML += 'MediaRecorder stopped<br>';
        if (isRecording) {
          sendAudioChunks();
          mediaRecorder.start(); // Restart recording immediately
        }
      };

      mediaRecorder.start();
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      if (debugDiv) debugDiv.innerHTML += `Microphone error: ${error.message}<br>`;
      isRecording = false;
    });
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (audioContext) {
    audioContext.close();
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  sendAudioChunks(); // Process any remaining audio in the buffer
}

function detectSilence() {
  const bufferLength = audioAnalyzer.fftSize;
  const dataArray = new Uint8Array(bufferLength);

  const checkSilence = () => {
    audioAnalyzer.getByteTimeDomainData(dataArray);
    let isSilent = true;

    for (let i = 0; i < bufferLength; i++) {
      if (dataArray[i] > 128 + 10 || dataArray[i] < 128 - 10) {
        isSilent = false;
        break;
      }
    }

    if (isSilent) {
      if (!silenceTimeout) {
        silenceTimeout = setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, silenceDelay);
      }
    } else {
      clearTimeout(silenceTimeout);
      silenceTimeout = null;
    }

    if (isRecording) {
      requestAnimationFrame(checkSilence);
    }
  };

  checkSilence();
}

async function sendAudioChunks() {
  if (audioChunks.length === 0) return;

  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  audioChunks = [];
  await sendToGoogleSpeechAPI(audioBlob);
}

async function sendToGoogleSpeechAPI(audioBlob) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async function() {
      const audioBase64 = reader.result.split(',')[1];
      if (debugDiv) debugDiv.innerHTML += `Sending audio chunk: ${audioBase64.length} characters<br>`;
      try {
        const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            config: {
              encoding: 'WEBM_OPUS',
              sampleRateHertz: 48000,
              languageCode: 'en-US',
              model: 'medical_dictation',
              enableAutomaticPunctuation: true
            },
            audio: {
              content: audioBase64
            }
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (debugDiv) debugDiv.innerHTML += `API Response: ${JSON.stringify(data)}<br>`;
        
        if (data.results && data.results.length > 0) {
          data.results.forEach(result => {
            if (result.alternatives && result.alternatives.length > 0) {
              const transcript = result.alternatives[0].transcript;
              if (transcript) {
                insertTextAtCursor(transcriptTextarea, transcript + ' ');
                if (debugDiv) debugDiv.innerHTML += 'Transcribed: ' + transcript + '<br>';
              }
            }
          });
        } else {
            if (debugDiv) debugDiv.innerHTML += 'No transcription in this response.<br>';
        }
        resolve();
      } catch (error) {
        console.error('Error transcribing audio:', error);
        if (debugDiv) debugDiv.innerHTML += `Transcription error: ${error.message}<br>`;
        reject(error);
      }
    };
    reader.readAsDataURL(audioBlob);
  });
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end, textarea.value.length);
  textarea.value = before + text + after;
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}
}}