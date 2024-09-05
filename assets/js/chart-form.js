export function appendPath(url, path) {
    return url.endsWith('/') ? url + path : url + '/' + path;
}

export function submitForm(form, url, accessToken, taskId) {
    console.log("chart-form::submitForm:",url);
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    sendRequest(url, data, accessToken, taskId);
}
// data determined by taskId
let CHART_umls_display_element;
let CHART_umls_element;
export function submitUMLSMapping(form,url, loc, accessToken, taskId, elId = 'UMLSMappingResult',elResId = 'UMLSResult') {
    console.log("chart-form::submitUMLSMapping:",url);
    CHART_umls_display_element = document.getElementById(elId);
    CHART_umls_element = document.getElementById(elResId);
    sendRequest(appendPath(url, loc), {}, accessToken, taskId, handleUMLSMappingResponse, 'application/json');
}
export function sendRequest(url, data, accessToken, taskId, responseHandler = handleFormResponse, responseType = 'text/html') {
    console.log(`chart-form::sendRequest to ${url}:`, (typeof data === 'object') ? JSON.stringify(data,null,2) : data);
    showLoading();

        fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Chart-Task': taskId,
                'Content-Type': 'application/json',
            },
            body: (typeof data === 'object') ? JSON.stringify(data) : data,
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
        response = result;
    console.log('Received response:', response); 
    if (CHART_umls_display_element) {
        const responseElement = document.createElement('p');
        responseElement.textContent = jsonToHtml((typeof(response)==='object')? response.UMLS : response,'section-content');
        CHART_umls_display_element.appendChild(responseElement);
    }
    //CHART_umls_display_element.innerHTML = jsonToHtml((typeof(response)==='object')? response.UMLS : response,'section-content');
    if (CHART_umls_element) CHART_umls_element.innerHTML = JSON.stringify(response);
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
  export function jsonToHtml(json,classname = 'section-content'){
    if (typeof json === 'string')
        return json;
    let html = '<div class="'+classname+'">';
    if (Array.isArray(json)) {
        html += '<ul>';
        json.forEach(item => {
            html += `<li>${jsonToHtml(item,classname)}</li>`;
        });
        html += '</ul>';
    } else if (typeof json === 'object' && json !== null) {
        html += '<ul>';
        for (let key in json) {
            if (json.hasOwnProperty(key)) {
                html += `<li><span class="key">${key}:</span> ${jsonToHtml(json[key],classname)}</li>`;
            }
        }
        html += '</ul>';
    } else {
        html += json;
    }
    html += '</div>';
    return html;
  }