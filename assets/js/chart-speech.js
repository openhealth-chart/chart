export class ChartRecorder {
  constructor(apiKey, silenceDelay = 400) {
    this.apiKey = apiKey;
    this.silenceDelay = silenceDelay;
    this.init();
  }
  init() {
    console.log("document onLoad from chart-speech");
    this.currentTextarea = null;
    this.startButton = document.getElementById('start-recognition');
    this.stopButton = document.getElementById('stop-recognition');
    this.debugDiv = document.getElementById('debug');
    this.mediaRecorder = null;
    this.isRecording = false;
    this.audioChunks = [];
    this.audioContext = null;
    this.audioAnalyzer = null;
    this.audioSource = null;
    this.silenceTimeout = null;
    this.stream = null;
    this.bubbleTimeout = null;
    this.mode = 'medical_dictation';

    const dictFields = document.querySelectorAll('textarea.dict, input.dict');

    dictFields.forEach(field => {
            if (field.tagName.toLowerCase() === 'textarea') {
        field.addEventListener('input', () => this.autoResize(field));
        this.autoResize(field);
      }
      field.addEventListener('click', () => {
        this.handleFieldActivation(field);
      });
      field.addEventListener('input', () => this.autoResize(field));
      field.addEventListener('focus', () => {
        this.handleFieldActivation(field);
      });
      field.addEventListener('blur', () => this.stopPulsating(field));
      field.addEventListener('keyup', (e) => this.updateBubblePosition(e));
    });

    if (this.stopButton) this.stopButton.disabled = true;
    this.currentTextarea = dictFields[0] || null;

    if (this.startButton) this.startButton.addEventListener('click', () => this.startRecording());
    if (this.stopButton) this.stopButton.addEventListener('click', () => this.stopRecording());
  }

  startRecording() {
    if (this.isRecording) return;
    this.isRecording = true;
    if (this.startButton) this.startButton.disabled = true;
    if (this.stopButton) this.stopButton.disabled = false;
    let convoCheck = document.getElementById("isConversation");
    if (convoCheck && convoCheck.checked) {
      this.mode = 'medical_conversation';
    } else {
      this.mode = 'medical_dictation';
    };
    // If no textarea is currently selected, select the first one
    if (!this.currentTextarea) {
      const dictFields = document.querySelectorAll('textarea.dict, input.dict');
      if (dictFields.length > 0) {
        this.handleFieldActivation(dictFields[0]);
      }
    } else {
      this.handleSpeechToText(this.currentTextarea);
    }
    this.isRecording = true;
    this.audioChunks = [];

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(str => {
        this.stream = str;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioAnalyzer = this.audioContext.createAnalyser();
        this.audioSource = this.audioContext.createMediaStreamSource(this.stream);
        this.audioSource.connect(this.audioAnalyzer);
        this.audioAnalyzer.fftSize = 2048;

        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType: 'audio/webm; codecs=opus'
        });

        this.mediaRecorder.ondataavailable = event => {
          this.audioChunks.push(event.data);
          if (this.debugDiv) this.debugDiv.innerHTML += `Audio data buffered: ${event.data.size} bytes<br>`;
        };

        this.mediaRecorder.onstart = () => {
          if (this.debugDiv) this.debugDiv.innerHTML += 'MediaRecorder started<br>';
          this.detectSilence();
        };

        this.mediaRecorder.onstop = () => {
          if (this.debugDiv) this.debugDiv.innerHTML += 'MediaRecorder stopped<br>';
          if (this.isRecording) {
            this.sendAudioChunks();
            this.mediaRecorder.start(); // Restart recording immediately
          }
        };

        this.mediaRecorder.start();
        // Focus on the current textarea after a short delay
        setTimeout(() => {
          if (this.currentTextarea) {
            this.currentTextarea.focus();
          }
        }, 100);
        const micIcon = document.getElementById('mic-icon');
        if (micIcon) {
          micIcon.classList.remove('hidden');
          micIcon.classList.add('bouncing');
        }

        // Position the icon near the cursor
        document.addEventListener('mousemove', this.updateMicPosition);
      })
      .catch(error => {
        console.error('Error accessing microphone:', error);
        if (this.debugDiv) this.debugDiv.innerHTML += `Microphone error: ${error.message}<br>`;
        this.isRecording = false;
      });
  }

  updateMicPosition(e) {
    const micIcon = document.getElementById('mic-icon');
    if (micIcon) {
      micIcon.style.left = (e.pageX + 10) + 'px';
      micIcon.style.top = (e.pageY + 10) + 'px';
    }
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.startButton.disabled = false;
    this.stopButton.disabled = true;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.sendAudioChunks(); // Process any remaining audio in the buffer
    this.stopPulsating(this.currentTextarea);
    const micIcon = document.getElementById('mic-icon');
    if (micIcon) {
      micIcon.classList.add('hidden');
      micIcon.classList.remove('bouncing');
      document.removeEventListener('mousemove', this.updateMicPosition);
    }
  }

  detectSilence() {
    if (!this.audioAnalyzer) {
      console.error("Audio analyzer not initialized, stopping recording");
      this.stopRecording();
      return;
    }
    const bufferLength = this.audioAnalyzer.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const checkSilence = () => {
      this.audioAnalyzer.getByteTimeDomainData(dataArray);
      let isSilent = true;

      for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > 128 + 10 || dataArray[i] < 128 - 10) {
          isSilent = false;
          break;
        }
      }

      if (isSilent) {
        if (!this.silenceTimeout) {
          this.silenceTimeout = setTimeout(() => {
            if (this.mediaRecorder.state === 'recording') {
              this.mediaRecorder.stop();
            }
          }, this.silenceDelay);
        }
      } else {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }

      if (this.isRecording) {
        requestAnimationFrame(checkSilence);
      }
    };

    checkSilence();
  }
  setMode(mode = 'medical_dictation') {
    this.mode = mode;
  }
  async sendAudioChunks() {
    if (this.audioChunks.length === 0) return;
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    this.audioChunks = [];
    await this.sendToGoogleSpeechAPI(audioBlob);
  }

  async sendToGoogleSpeechAPI(audioBlob) {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        const audioBase64 = reader.result.split(',')[1];
        if (this.debugDiv) this.debugDiv.innerHTML += `Sending audio chunk: ${audioBase64.length} characters<br>`;
        try {
          const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: 'en-US',
                model: this.mode,
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
          if (this.debugDiv) this.debugDiv.innerHTML += `API Response: ${JSON.stringify(data)}<br>`;
          if (data.results && data.results.length > 0) {
            data.results.forEach(result => {
              if (result.alternatives && result.alternatives.length > 0) {
                const transcript = result.alternatives[0].transcript;
                if (transcript) {
                  this.showTranscriptionBubble(transcript);
                  this.insertTextAtCursor(transcript + ' ');
                  if (this.debugDiv) this.debugDiv.innerHTML += 'Transcribed: ' + transcript + '<br>';
                }
              }
            });
          } else {
            if (this.debugDiv) this.debugDiv.innerHTML += 'No transcription in this response.<br>';
          }
          resolve();
        } catch (error) {
          console.error('Error transcribing audio:', error);
          if (this.debugDiv) this.debugDiv.innerHTML += `Transcription error: ${error.message}<br>`;
          reject(error);
        }
      };
      reader.readAsDataURL(audioBlob);
    });
  }

  showTranscriptionBubble(text) {
    const bubble = document.getElementById('transcription-bubble');
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.remove('hidden');

    // Clear any existing timeout
    clearTimeout(this.bubbleTimeout);

    // Update bubble position immediately
    this.updateBubblePosition();

    // Add event listener for cursor movement
    document.addEventListener('mousemove', this.updateBubblePosition);

    // Hide the bubble after 3 seconds
    this.bubbleTimeout = setTimeout(() => {
      bubble.classList.add('hidden');
      document.removeEventListener('mousemove', this.updateBubblePosition);
    }, 3000);
  }

  updateBubblePosition(e) {
    const bubble = document.getElementById('transcription-bubble');
    if (!this.currentTextarea) return;
    if (!bubble) return;
    const rect = this.currentTextarea.getBoundingClientRect();

    let x, y;

    if (e) {
      // If called from mousemove event
      x = e.clientX;
      y = e.clientY;
    } else {
      // If called without event (initial positioning)
      x = rect.left + this.currentTextarea.selectionStart % this.currentTextarea.cols * (rect.width / this.currentTextarea.cols);
      y = rect.top + Math.floor(this.currentTextarea.selectionStart / this.currentTextarea.cols) * (rect.height / this.currentTextarea.rows);
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

  insertTextAtCursor(text) {
    if (!this.currentTextarea) {
      // If currentTextarea is not set or no longer in the document,
      // set it to the first available dict field
      const dictFields = document.querySelectorAll('textarea.dict, input.dict');
      this.currentTextarea = dictFields[0] || null;
    }
    if (!this.currentTextarea) return;
    if (this.currentTextarea.tagName.toLowerCase() === 'textarea' || this.currentTextarea.type === 'text') {
      const start = this.currentTextarea.selectionStart;
      const end = this.currentTextarea.selectionEnd;
      const before = this.currentTextarea.value.substring(0, start);
      const after = this.currentTextarea.value.substring(end, this.currentTextarea.value.length);
      this.currentTextarea.value = before + text + after;
      this.currentTextarea.selectionStart = this.currentTextarea.selectionEnd = start + text.length;

      // Call autoResize for textareas
      if (this.currentTextarea.tagName.toLowerCase() === 'textarea') {
        this.autoResize(this.currentTextarea);
      }
    }
    this.handleSpeechToText(this.currentTextarea);
  }

  handleFieldActivation(field) {
    this.currentTextarea = field;
    console.log("field activated:", field.name);
    if (document.activeElement !== field) {
      field.focus(); // Ensure the field is focused
    }
    if (this.isRecording) {
      this.handleSpeechToText(field);
    } else {
      this.setFuzzyOutline(field, 'rgba(0, 0, 255, 0.5)'); // Semi-transparent blue
    }
    this.updateBubblePosition();
  }

  setFuzzyOutline(e, color) {
    e.style.boxShadow = `0 0 8px 3px ${color}`;
  }

  removeFuzzyOutline(e) {
    e.style.boxShadow = 'none';
  }

  handleSpeechToText(field) {
    if (field) {
      field.classList.add('pulsating');
      this.setFuzzyOutline(field, 'rgba(255, 0, 0, 0.5)');
      // Ensure this field is set as the current textarea
      console.log("currentTextarea being set:", field.name);
      this.currentTextarea = field;
    }
  }

  stopPulsating(e) {
    if (e) {
      e.classList.remove('pulsating');
      this.removeFuzzyOutline(e);
    }
  }

  autoResize(e) {
    const elem = e.target || e;
    if (elem.tagName.toLowerCase() !== 'textarea') return;
    // Store the current scroll position
    const scrollTop = elem.scrollTop;
    // Temporarily shrink the textarea to get the correct scrollHeight
    elem.style.height = '0';
    // Set the height to the scrollHeight
    const newHeight = elem.scrollHeight;
    elem.style.height = newHeight + 'px';
    // Restore the scroll position
    elem.scrollTop = scrollTop;
  }

  showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async sendPdfToGoogleCloudOcr(pdfFile, apiKey) {
    // Base64 encode the PDF file
    const fileReader = new FileReader();
    const base64EncodedPdf = await new Promise((resolve, reject) => {
      fileReader.onload = () => resolve(fileReader.result.split(',')[1]);
      fileReader.onerror = error => reject(error);
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
      const response = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return this.extractTextFromResponse(result);
    } catch (error) {
      console.error(error.message);
      throw error;
    }
  }

  extractTextFromResponse(apiResponse) {
    let extractedText = '';
    if (apiResponse.responses) {
      apiResponse.responses.forEach(response => {
        if (response.fullTextAnnotation) {
          extractedText += response.fullTextAnnotation.text + '\n';
        }
      });
    }
    return extractedText;
  }
}
export function extractAnswer(result) {
  if (typeof(result) === 'object') {
    const answer = result.answer;
    if (answer) return answer;
    return result[Object.keys(result)[0]];
  }
  return result;
}