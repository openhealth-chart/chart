export function appendPath(url, path) {
    return url.endsWith('/') ? url + path : url + '/' + path;
}

export async function submitForm(form, url, accessToken, taskId) {
    console.log("chart-form::submitForm:",url);
    console.log("chart-form::submitForm:taskId:",taskId);
    console.log("chart-form::submitForm:accessToken:",accessToken);
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    await sendRequest(url, data, accessToken, taskId);
}
export async function submitQuestion(form, url, loc, accessToken, taskId){
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    const conversation = document.getElementById('conversation');
    appendQuestion(conversation, form.diagnosticQuestion.value);
    form.diagnosticQuestion.value = '';

    await sendRequest(appendPath(url, loc), data, accessToken, taskId, handleQuestionResponse);
}
// data determined by taskId
let CHART_umls_display_element;
let CHART_umls_element;
export async function submitUMLSMapping(form,url, loc, accessToken, taskId, data = {}, elId = 'UMLSMappingResult',elResId = 'UMLSResult') {
    console.log("chart-form::submitUMLSMapping:",url);
    CHART_umls_display_element = document.getElementById(elId);
    CHART_umls_element = document.getElementById(elResId);
    await sendRequest(appendPath(url, loc), data, accessToken, taskId, handleUMLSMappingResponse);
}
export async function sendRequest(url, data, accessToken, taskId, responseHandler = handleFormResponse) {
    showLoading();
    const stringBody = (typeof data === 'object') ? JSON.stringify(data) : data;
    console.log(`chart-form::sendRequest to ${url}: ${stringBody}`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Chart-Task': taskId,
                'Content-Type': 'application/json',
            },
            body: stringBody,
            credentials: 'include',
        });

        if (response.status === 202) {
            // Task is queued, start polling
            console.log("chart-form::sendRequest: task queued");
            await pollForResult(url, accessToken, taskId, responseHandler);
        } else if (response.ok) {
            // Process the response immediately
            console.log("chart-form::sendRequest: task complete");
            await processResponse(response, responseHandler);
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

    } catch (error) {
        handleError(error);
    } finally {
        hideLoading();
    }
}

async function pollForResult(url, accessToken, taskId, responseHandler, maxAttempts = 60, interval = 2000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        console.log(`chart-form::pollForResult: attempt ${attempt + 1} of ${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, interval));
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Chart-Task': taskId,
                },
                credentials: 'include',
            });

            if (response.status === 200) {
                // Task is complete, process the response
                console.log("chart-form::pollForResult: task complete");
                await processResponse(response, responseHandler);
                return;
            } else if (response.status === 202) {
                // Task is still in progress, continue polling
                console.log("chart-form::pollForResult: task in progress:", response.json()?.message);
            } else  {
                // Unexpected status, throw an error
                console.log("chart-form::pollForResult: status:",response.status);
                throw new Error(`Unexpected status during polling: ${response.status}`);
            }
            // If status is 202, continue polling
    }
    throw new Error(`Polling timed out: ${maxAttempts} attempts`);
}

async function processResponse(response, responseHandler) {
    const contentType = response.headers.get('content-type');
    let responseData;

    if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
    } else {
        responseData = await response.text();
    }

    responseHandler(responseData);
}



export function handleFormResponse(response) {
    console.log("response:", response);
    // Check if the response contains valid HTML
    if (typeof response === 'string' ) {
        try {
            // Clear the current document and write the response as new HTML
            document.open();
            document.write(response);
            document.close();
        } catch (error) {
            console.error("Error while writing HTML to document:", error);
        }
    } else {
        // Handle non-HTML responses or fallback for safety
        console.log('Handling non-HTML response:', response);
    }
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
    if (!CHART_umls_display_element) CHART_umls_display_element = document.getElementById("UMLSMappingResult");
    if (!CHART_umls_element) CHART_umls_element = document.getElementById("UMLSResult");
    if (typeof result === 'string')
        response = JSON.parse(result) || result;
    else
        response = result;
    console.log('Received response:', response); 
    if (CHART_umls_display_element) {
        const responseElement = document.createElement('p');
        responseElement.innerHTML = jsonToHtml(response,'section-content');
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