export function appendPath(url, path) {
    return url.endsWith('/') ? url + path : url + '/' + path;
}

export function submitForm(form, url, accessToken, taskId) {

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    sendRequest(url, data, accessToken, taskId);
}

export function submitQuestion(form, url, loc, accessToken, taskId) {

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    const conversation = document.getElementById('conversation');
    appendQuestion(conversation, form.codingQuestion.value);
    form.codingQuestion.value = '';

    sendRequest(appendPath(url, loc), data, accessToken, taskId, handleQuestionResponse, 'application/json');
}

export function sendRequest(url, data, accessToken, taskId, responseHandler = handleFormResponse, responseType = 'text/html') {
    console.log(`Submitting to ${url}:`, JSON.stringify(data));
    showLoading();
    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Chart-Task': taskId,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        credentials: 'include'
    })
        .then(response => {
            if (responseType === 'application/json') {
                return response.json();
            } else {
                return response.text();
            }
        })
        .then(responseHandler)
        .catch(handleError)
        .finally(() => {
            hideLoading();
        });
}

export function handleFormResponse(html) {
    console.log("response:", html);
    document.open();
    document.write(html);
    document.close();
}

export function handleQuestionResponse(result) {
    let responseText = typeof result === 'string' ? JSON.parse(result).answer || result : JSON.stringify(result);
    console.log('Received response:', responseText);
    appendResponse(document.getElementById('conversation'), responseText);
}

export function handleError(error) {
    console.error('Error:', error);
    alert('An error occurred: ' + error.message);
}

function appendQuestion(conversation, question) {
    const questionElement = document.createElement('p');
    questionElement.className = 'question';
    questionElement.textContent = question;
    conversation.appendChild(questionElement);
}

function appendResponse(conversation, response) {
    const responseElement = document.createElement('p');
    responseElement.className = 'response';
    responseElement.textContent = response;
    conversation.appendChild(responseElement);
}
export function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

 export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }