export function appendPath(url, path) {
    return url.endsWith('/') ? url + path : url + '/' + path;
}

export function submitForm(form, url, accessToken, taskId) {
    console.log("chart-form::submitForm:",url);
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    sendRequest(url, data, accessToken, taskId);
}
export function submitQuestion(form, url, loc, accessToken, taskId) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    const conversation = document.getElementById('conversation');
    appendQuestion(conversation, form.diagnosticQuestion.value);
    form.diagnosticQuestion.value = '';

    sendRequest(appendPath(url, loc), data, accessToken, taskId, handleQuestionResponse, 'application/json');
}
// data determined by taskId
export function submitUMLSMapping(url, loc, accessToken, taskId) {
    sendRequest(appendPath(url, loc), {}, accessToken, taskId, handleUMLSMappingResponse, 'application/json');
}
export function sendRequest(url, data, accessToken, taskId, responseHandler = handleFormResponse, responseType = 'text/html') {
    console.log(`chart-form::sendRequest to ${url}:`, JSON.stringify(data,null,2));
    showLoading();

        fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Chart-Task': taskId,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
            credentials: 'include',
            // Note: We're not setting redirect: 'manual' here
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            if (responseType === 'application/json') {
                return response.json();
            } else {
                return response.text();
            }
        })
        .then(responseData => {
            responseHandler(responseData);
        })
        .catch(error => {
            handleError(error);
        })
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
    let responseText;
    if (typeof result === 'string')
        responseText = JSON.parse(result).answer || result;
    else
        responseText = (result.answer) ? JSON.stringify(result.answer) : JSON.stringify(result);
    console.log('Received response:', responseText);
    appendResponse(document.getElementById('conversation'), responseText);
}
export function handleUMLSMappingResponse(result) {
    let response;
    if (typeof result === 'string')
        response = JSON.parse(result) || result;
    else
        response = result
    console.log('Received response:', response);
    const umlsEl = document.getElementById('UMLSMappingResult');
    umlsEl.innerHTML = JSON.stringify(response, null, 2);
}
export function handleError(error) {
    console.error('Error:', error);
    alert('An error occurred: ' + error.message);
    location.reload();
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