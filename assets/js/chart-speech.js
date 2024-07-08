function chartRecorderInit(key,pause = 600) {
  const apiKey = key;

  const startButton = document.getElementById('start-recognition');
  const stopButton = document.getElementById('stop-recognition');

  const debugDiv = document.getElementById('debug');
  let mediaRecorder;
  let isRecording = false;
  let audioChunks = [];
  let audioContext;
  let audioAnalyzer;
  let audioSource;
  let silenceTimeout;
  let stream;
  const silenceDelay = pause; // 1.2 seconds of silence

  if (startButton) startButton.addEventListener('click', startRecording);
  if (stopButton) stopButton.addEventListener('click', stopRecording);
  // start with first
  let currentTextarea;

  function startRecording() {
    if (isRecording) return;
    isRecording = true;
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
  
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
        // Focus on the current textarea after a short delay
        setTimeout(() => {
            if (currentTextarea) {
              currentTextarea.focus();
            }
          }, 100);
        const micIcon = document.getElementById('mic-icon');
        if (micIcon) {
          micIcon.classList.remove('hidden');
          micIcon.classList.add('bouncing');
        }

  // Position the icon near the cursor
        document.addEventListener('mousemove', updateMicPosition);
      })
      .catch(error => {
        console.error('Error accessing microphone:', error);
        if (debugDiv) debugDiv.innerHTML += `Microphone error: ${error.message}<br>`;
        isRecording = false;
      });
  }
  function updateMicPosition(e) {
    const micIcon = document.getElementById('mic-icon');
    if (micIcon) {
      micIcon.style.left = (e.pageX + 10) + 'px';
      micIcon.style.top = (e.pageY + 10) + 'px';
    }
  }
  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    startButton.disabled = false;
    stopButton.disabled = true;
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
    stopPulsating();
    const micIcon = document.getElementById('mic-icon');
    if (micIcon) {
      micIcon.classList.add('hidden');
      micIcon.classList.remove('bouncing');
      document.removeEventListener('mousemove', updateMicPosition);
    }
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
                  showTranscriptionBubble(transcript);
                  insertTextAtCursor(transcript + ' ');
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
  let bubbleTimeout;

  function showTranscriptionBubble(text) {
    const bubble = document.getElementById('transcription-bubble');
    bubble.textContent = text;
    bubble.classList.remove('hidden');
    
    // Clear any existing timeout
    clearTimeout(bubbleTimeout);
    
    // Update bubble position immediately
    updateBubblePosition();
    
    // Add event listener for cursor movement
    document.addEventListener('mousemove', updateBubblePosition);
    
    // Hide the bubble after 3 seconds
    bubbleTimeout = setTimeout(() => {
      bubble.classList.add('hidden');
      document.removeEventListener('mousemove', updateBubblePosition);
    }, 3000);
  }
  
  function updateBubblePosition(e) {
    const bubble = document.getElementById('transcription-bubble');
    const rect = currentTextarea.getBoundingClientRect();
    
    let x, y;
    
    if (e) {
      // If called from mousemove event
      x = e.clientX;
      y = e.clientY;
    } else {
      // If called without event (initial positioning)
      x = rect.left + currentTextarea.selectionStart % currentTextarea.cols * (rect.width / currentTextarea.cols);
      y = rect.top + Math.floor(currentTextarea.selectionStart / currentTextarea.cols) * (rect.height / currentTextarea.rows);
    }
    
    // Adjust position to avoid going off-screen
    const bubbleRect = bubble.getBoundingClientRect();
    if (x + bubbleRect.width > window.innerWidth) {
      x = window.innerWidth - bubbleRect.width;
    }
    if (y + bubbleRect.height > window.innerHeight) {
      y = window.innerHeight - bubbleRect.height;
    }
    
    bubble.style.left = `${x + 20}px`;
    bubble.style.top = `${y + 20}px`;
  }

  function insertTextAtCursor(text) {
    if (!currentTextarea) return;
    
    const start = currentTextarea.selectionStart;
    const end = currentTextarea.selectionEnd;
    const before = currentTextarea.value.substring(0, start);
    const after = currentTextarea.value.substring(end, currentTextarea.value.length);
    currentTextarea.value = before + text + after;
    currentTextarea.selectionStart = currentTextarea.selectionEnd = start + text.length;
    currentTextarea.focus();
    handleSpeechToText();
  }
function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
    }

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
    }
document.addEventListener('DOMContentLoaded', (event) => {
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
    textarea.addEventListener('input', autoResize);
    textarea.addEventListener('focus', () => {
      currentTextarea = textarea;
      if (isRecording) {
        handleSpeechToText();
      } else 
        setFuzzyOutline('rgba(0, 0, 255, 0.5)'); // Semi-transparent blue
      updateBubblePosition(); 
    });
    textarea.addEventListener('blur', () =>{
      stopPulsating();
    });

// Call autoResize immediately to set initial height
    autoResize({ target: textarea });
    currentTextarea = document.querySelector('textarea'); // Default to first textarea

    // Add event listeners to all textareas to track the current one
    });
    if (stopButton) stopButton.disabled = true;

});
function setFuzzyOutline(color) {
  currentTextarea.style.boxShadow = `0 0 8px 3px ${color}`;
}

function removeFuzzyOutline() {
  currentTextarea.style.boxShadow = 'none';
}
function handleSpeechToText() {
  currentTextarea.classList.add('pulsating');
  setFuzzyOutline('rgba(255, 0, 0, 0.5)');
}

// Add this function to stop pulsating
function stopPulsating() {
  currentTextarea.classList.remove('pulsating');
  removeFuzzyOutline();
}
function autoResize(e) {
        e.target.style.height = 'auto';
        e.target.style.height = (e.target.scrollHeight) + 'px';
        e.target.scrollTop = e.target.scrollHeight - e.target.clientHeight; 
    }
 // Function to send PDF to Google Cloud Vision OCR

}
async function sendPdfToGoogleCloudOcr(pdfFile,apiKey) {
  // Base64 encode the PDF file
  const fileReader = new FileReader();
  const base64EncodedPdf = await new Promise((resolve) => {
    console.log('starting file read');
    fileReader.onload = () => resolve(fileReader.result.split(',')[1]);
    fileReader.readAsDataURL(pdfFile);
  });

  // Prepare the request body
  const requestBody = {
    requests: [
      {
        inputConfig: {
          mimeType: 'application/pdf',
          content: base64EncodedPdf
        },
        features: [
          {
            type: 'DOCUMENT_TEXT_DETECTION'
          }
        ]
      }
    ]
  };

  // Send the request to Google Cloud Vision API
  try {
    console.log('sending to Google Vision<');
    const response = await fetch('https://vision.googleapis.com/v1/files:annotate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}` // Replace with your actual API key
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log('returned from  Google Vision');
    const result = await response.json();
    return extractTextFromResponse(result);
  } catch (error) {
    console.error(error.message);
    throw error;
  }
}

// Helper function to extract text from the API response
function extractTextFromResponse(apiResponse) {
  let extractedText = '';
  apiResponse.responses.forEach(response => {
    if (response.fullTextAnnotation) {
      extractedText += response.fullTextAnnotation.text + '\n';
    }
  });
  return extractedText;
}
