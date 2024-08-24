
function appendPath(url, path) {
    return url.endsWith('/') ? url + path : url + '/' + path;
    }
function submitForm(form, url) {
    chartRecorder.showLoading();

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    const procedures = document.getElementById('procedures');
        data.procedures = procedures.value.split(/[\n,]/).filter(line => line.trim() !== '');
        data.icd10_codes = Array.from(document.querySelectorAll('input[name="icd10_codes"]:checked')).map(checkbox => checkbox.value);
        data.cpt_codes = Array.from(document.querySelectorAll('input[name="cpt_codes"]:checked')).map(checkbox => checkbox.value);

        sendRequest(url, data);
    }
function submitQuestion(form, url,loc) {
    chartRecorder.showLoading();

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    const conversation = document.getElementById('conversation');
        appendQuestion(conversation, form.codingQuestion.value);
        form.codingQuestion.value = '';

        sendRequest(appendPath(url,loc), data, handleQuestionResponse);
    }

function sendRequest(url, data, responseHandler = handleFormResponse) {
            console.log(`Submitting to ${url}:`, JSON.stringify(data));
            fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer {{accessToken}}',
                    'X-Chart-Task': '{{context.taskId}}',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                credentials: 'include'
            })
                .then(response => response.json())
                .then(responseHandler)
                .catch(handleError)
                .finally(() => {
                    chartRecorder.hideLoading();
                });
}

    function handleFormResponse(html) {
        document.open();
        document.write(html);
        document.close();
    }

    function handleQuestionResponse(result) {
        let responseText = typeof result === 'string' ? JSON.parse(result).answer || result : JSON.stringify(result);
        appendResponse(document.getElementById('conversation'), responseText);
    }

    function handleError(error) {
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