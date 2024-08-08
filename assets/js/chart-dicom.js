
        const fileListElement = document.getElementById('fileList');
        const folderInput = document.getElementById('folderInput');
        const imageElement = document.getElementById('dicomImage');
        const dicomInfoElement = document.getElementById('dicomInfo');
        const errorMessageElement = document.getElementById('errorMessage');
        const prevImageButton = document.getElementById('prevImage');
        const nextImageButton = document.getElementById('nextImage');
        const prevSeriesButton = document.getElementById('prevSeries');
        const nextSeriesButton = document.getElementById('nextSeries');
        const imageIndexSpan = document.getElementById('imageIndex');
        const seriesIndexSpan = document.getElementById('seriesIndex');
        const imageFileSpan = document.getElementById('imageFile');
        const imageIdSpan = document.getElementById('imageId');
        const windowWidthInput = document.getElementById('windowWidth');
        const windowCenterInput = document.getElementById('windowCenter');

        let dicomdir = null;
        let currentSeriesIndex = 0;
        let currentImageIndex = 0;
        let currentSeries = [];
        let currentImage = null;
        let filesMap = {}; // Store file objects keyed by their paths
        let files = [];
        const studyMap = new Map(); // Store studies, series, and instances
        let dataSet = null;
        let blob = null;

        folderInput.addEventListener('change', handleFolderSelect);
        prevImageButton.addEventListener('click', showPreviousImage);
        nextImageButton.addEventListener('click', showNextImage);
        prevSeriesButton.addEventListener('click', showPreviousSeries);
        nextSeriesButton.addEventListener('click', showNextSeries);
        windowWidthInput.addEventListener('input', updateWindowing);
        windowCenterInput.addEventListener('input', updateWindowing);

async function handleFolderSelect(event) {
            files = Array.from(event.target.files).filter(file => 
                file.name.toLowerCase().endsWith('.dcm') || 
                file.name.toLowerCase() === 'dicomdir'
            );

            // Sort files alphabetically
            files.sort((a, b) => {
                const dirA = a.webkitRelativePath.split('/').slice(0, -1).join('/');
                const dirB = b.webkitRelativePath.split('/').slice(0, -1).join('/');
                const nameA = a.name.toLowerCase();
                const nameB = b.name.toLowerCase();
                if (dirA < dirB) return -1;
                if (dirA > dirB) return 1;
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
            });

            fileListElement.innerHTML = '';
            files.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.textContent = file.name;
                fileItem.onclick = () => loadAndViewDicom(index);
                fileListElement.appendChild(fileItem);
            });
    filesMap = {};
    studyMap.clear();
    currentSeries = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = file.webkitRelativePath || file.name;
        filesMap[filePath] = file;
        currentSeries.push({file, filePath});
 
        await loadAndViewDicom(i);
        await processLoadedDicom(filePath);
    }

    dicomdir = createDicomDirFromStudyMap();
    updateUI();
}

async function processLoadedDicom(filePath) {
    if (!dataSet) {
        console.warn(`No data loaded for file: ${filePath}`);
        return;
    }

    const studyInstanceUID = dataSet.string('x0020000d') || 'Unknown';
    const seriesInstanceUID = dataSet.string('x0020000e') || 'Unknown';
    const sopInstanceUID = dataSet.string('x00080018') || 'Unknown';

    if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
        console.warn(`Skipping file ${filePath}: Missing required UIDs`);
        return;
    }

    updateStudyMap(dataSet, studyInstanceUID, seriesInstanceUID, sopInstanceUID, filePath);
}

function createDicomDirFromStudyMap() {
    const dicomDirJson = {
        "00041220": { // Directory Record Sequence
            "vr": "SQ",
            "Value": []
        }
    };

    studyMap.forEach((study, studyInstanceUID) => {
        const studyRecord = {
            "00041430": { "vr": "CS", "Value": ["STUDY"] }, // Directory Record Type
            "0020000D": study['0020000D'], // Study Instance UID
            "00080020": study['00080020'], // Study Date
            "00100020": study['00100020'], // Patient ID
            "00100010": study['00100010'], // Patient's Name
            "00041220": { // Lower-Level Directory Record Sequence
                "vr": "SQ",
                "Value": []
            }
        };

        study.series.forEach((series, seriesInstanceUID) => {
            const seriesRecord = {
                "00041430": { "vr": "CS", "Value": ["SERIES"] }, // Directory Record Type
                "0020000E": series['0020000E'], // Series Instance UID
                "00200011": series['00200011'], // Series Number
                "00080060": series['00080060'], // Modality
                "00041220": { // Lower-Level Directory Record Sequence
                    "vr": "SQ",
                    "Value": []
                }
            };

            series.instances.forEach(instance => {
                const instanceRecord = {
                    "00041430": { "vr": "CS", "Value": ["IMAGE"] }, // Directory Record Type
                    "00080018": instance['00080018'], // SOP Instance UID
                    "00200013": instance['00200013'], // Instance Number
                    "00041500": instance['00041500'], // Referenced File ID
                    "00041511": instance['00080018'] // Referenced SOP Instance UID in File
                };
                seriesRecord["00041220"].Value.push(instanceRecord);
            });

            studyRecord["00041220"].Value.push(seriesRecord);
        });

        dicomDirJson["00041220"].Value.push(studyRecord);
    });

    return dicomDirJson;
}
function updateStudyMap(dataSet, studyInstanceUID, seriesInstanceUID, sopInstanceUID, filePath) {
    if (!studyMap.has(studyInstanceUID)) {
        studyMap.set(studyInstanceUID, {
            '0020000D': { "vr": "UI", "Value": [studyInstanceUID] },
            '00080020': { "vr": "DA", "Value": [dataSet.string('x00080020') || ''] },
            '00100020': { "vr": "LO", "Value": [dataSet.string('x00100020') || ''] },
            '00100010': { "vr": "PN", "Value": [dataSet.string('x00100010') || ''] },
            series: new Map()
        });
    }

    const study = studyMap.get(studyInstanceUID);
    if (!study.series.has(seriesInstanceUID)) {
        study.series.set(seriesInstanceUID, {
            '0020000E': { "vr": "UI", "Value": [seriesInstanceUID] },
            '00200011': { "vr": "IS", "Value": [dataSet.string('x00200011') || ''] },
            '00080060': { "vr": "CS", "Value": [dataSet.string('x00080060') || ''] },
            instances: []
        });
    }

    const series = study.series.get(seriesInstanceUID);
    series.instances.push({
        '00080018': { "vr": "UI", "Value": [sopInstanceUID] },
        '00200013': { "vr": "IS", "Value": [dataSet.string('x00200013') || ''] },
        '00041500': { "vr": "CS", "Value": [filePath] }
    });
}
async function loadAndViewDicom(index) {
    currentSeriesIndex = Math.floor(index / currentSeries.length);
    currentImageIndex = index % files.length;

    const seriesItem = currentSeries[index];
    const file = seriesItem.file;
    
    // Create a Blob URL for the file
    blob = new Blob([file], { type: 'application/dicom' });
    const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(blob);

    imageFileSpan.innerHTML = file.name;
    imageIdSpan.innerHTML = imageId;

    cornerstone.enable(imageElement);

    try {
        const image = await cornerstone.loadImage(imageId);
        dataSet = image.data;
        cornerstone.displayImage(imageElement, image);
        displayDicomInfo(image);

        // Set up tools
        const WwwcTool = cornerstoneTools.WwwcTool;
        const PanTool = cornerstoneTools.PanTool;
        const ZoomTool = cornerstoneTools.ZoomTool;
        cornerstoneTools.addTool(WwwcTool);
        cornerstoneTools.addTool(PanTool);
        cornerstoneTools.addTool(ZoomTool);
        cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });
        cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 2 });
        cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 4 });

        errorMessageElement.textContent = '';
        updateImageIndex();
        updateSeriesIndex();
    } catch (error) {
        console.error('Error loading DICOM image:', error);
        errorMessageElement.textContent = `Error loading image: ${error.message}`;
    }
}
function displayDicomInfo(image) {
            const dataSet = image.data;
            const patientName = dataSet.string('x00100010') || 'N/A';
            const studyDate = dataSet.string('x00080020') || 'N/A';
            const modality = dataSet.string('x00080060') || 'N/A';
            const seriesNumber = dataSet.string('x00200011') || 'N/A';

            dicomInfoElement.innerHTML = `
                <p>Patient: ${patientName}</p>
                <p>Study Date: ${studyDate}</p>
                <p>Modality: ${modality}</p>
                <p>Series Number: ${seriesNumber}</p>
            `;
 }

function showPreviousImage() {
            if (currentImageIndex > 0) {
                currentImageIndex--;
                loadAndViewDicom(currentImageIndex);
                updateImageIndex();
            }
}
function showNextImage() {
            if (currentImageIndex < files.length - 1) {
                currentImageIndex++;
                loadAndViewDicom(currentImageIndex);
                updateImageIndex();
            }
        }

function showPreviousSeries() {
    /*
            if (currentSeriesIndex > 0) {
                currentSeriesIndex--;
                loadAndViewDicom(0);
                updateSeriesIndex();
            }
    */
}

function showNextSeries() {
    /*
            if (currentSeriesIndex < currentSeries.length - 1) {
                currentSeriesIndex++;
                loadAndViewDicom( 0);
                updateSeriesIndex();
            }
    */
    }

 function updateImageIndex() {
            imageIndexSpan.textContent = `Image ${currentImageIndex + 1} of ${currentSeries.length}`;
        }

 function updateSeriesIndex() {
            seriesIndexSpan.textContent = `Series ${currentSeriesIndex + 1} of ${files.length}`;
        }

function updateWindowing() {
            const viewport = cornerstone.getViewport(imageElement);
            viewport.voi.windowWidth = parseInt(windowWidthInput.value);
            viewport.voi.windowCenter = parseInt(windowCenterInput.value);
            cornerstone.setViewport(imageElement, viewport);
        }
function dicomToJSON(dataSet) {
    const json = {};

    // Iterate over each element in the dataSet
    Object.keys(dataSet.elements).forEach(tag => {
        const element = dataSet.elements[tag];
        const vr = element.vr;
        const value = getValue(element, dataSet);
        
        json[tag] = {
            "vr": vr,
            "Value": value
        };

        if (vr === 'UN' && element.InlineBinary) {
            json[tag]["InlineBinary"] = element.InlineBinary;
            delete json[tag]["Value"];
        }
    });

    return JSON.stringify(json, null, 2);
}

function getValue(element, dataSet) {
    const value = dataSet.string(element.tag);
    if (value === undefined || value === null || value === "") {
        return undefined;  // omit "Value" for empty values
    }

    switch (element.vr) {
        case 'PN':
            return value.split('\\').map(parsePersonName);
        case 'DA':
        case 'TM':
        case 'DT':
            return value.split('\\');
        case 'IS':
            return value.split('\\').map(v => parseInt(v));
        case 'DS':
        case 'FL':
        case 'FD':
            return value.split('\\').map(v => parseFloat(v));
        case 'SQ':
            return element.items.map(item => dicomToJSON(item.dataSet));
        case 'OB':
        case 'OD':
        case 'OF':
        case 'OL':
        case 'OV':
        case 'OW':
            // This should be handled differently, possibly with a BulkDataURI
            return undefined;
        default:
            return [value];
    }
}

function parsePersonName(name) {
    const [Alphabetic, Ideographic, Phonetic] = name.split('=');
    const parsedName = {};

    if (Alphabetic) {
        const [familyName, givenName, middleName, prefix, suffix] = Alphabetic.split('^');
        parsedName.Alphabetic = {
            FamilyName: familyName || undefined,
            GivenName: givenName || undefined,
            MiddleName: middleName || undefined,
            NamePrefix: prefix || undefined,
            NameSuffix: suffix || undefined
        };
    }

    // Similar parsing for Ideographic and Phonetic...

    return parsedName;
}

async function createDicomDirJson(files) {
    const dicomDirJson = {
        records: []
    };

    const studyMap = new Map();

    // Iterate over all files and parse them
    for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        const patientID = dataSet.string('x00100020') || 'Unknown';
        const patientName = dataSet.string('x00100010') || 'Unknown';
        const studyInstanceUID = dataSet.string('x0020000d');
        const seriesInstanceUID = dataSet.string('x0020000e');
        const sopInstanceUID = dataSet.string('x00080018');
        const modality = dataSet.string('x00080060');
        const studyDate = dataSet.string('x00080020');
        const seriesNumber = dataSet.string('x00200011');
        const instanceNumber = dataSet.string('x00200013');
        const filePath = file.webkitRelativePath || file.name;
        console.log("filePath:",filePath);

        if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
            continue; // Skip files that do not have the required UIDs
        }

        if (!studyMap.has(studyInstanceUID)) {
            studyMap.set(studyInstanceUID, {
                '0020000D': { vr: 'UI', Value: [studyInstanceUID] },
                '00080020': { vr: 'DA', Value: [studyDate] },
                '00100020': { vr: 'LO', Value: [patientID] },
                '00100010': { vr: 'PN', Value: [patientName] },
                series: []
            });
        }

        const study = studyMap.get(studyInstanceUID);

        let series = study.series.find(s => s['0020000E'].Value[0] === seriesInstanceUID);
        if (!series) {
            series = {
                '0020000E': { vr: 'UI', Value: [seriesInstanceUID] },
                '00200011': { vr: 'IS', Value: [seriesNumber] },
                '00080060': { vr: 'CS', Value: [modality] },
                instances: []
            };
            study.series.push(series);
        }

        series.instances.push({
            '00080018': { vr: 'UI', Value: [sopInstanceUID] },
            '00200013': { vr: 'IS', Value: [instanceNumber] },
            '00041500': { vr: 'CS', Value: [filePath] }
        });
    }

    // Convert the study map to JSON structure
    studyMap.forEach((study, studyInstanceUID) => {
        dicomDirJson.records.push({
            '0020000D': study['0020000D'],
            '00080020': study['00080020'],
            '00100020': study['00100020'],
            '00100010': study['00100010'],
            series: study.series.map(series => ({
                '0020000E': series['0020000E'],
                '00200011': series['00200011'],
                '00080060': series['00080060'],
                instances: series.instances.map(instance => ({
                    '00080018': instance['00080018'],
                    '00200013': instance['00200013'],
                    '00041500': instance['00041500']
                }))
            }))
        });
    });

    return dicomDirJson;
}
async function getPresignedUrls(location,dicomdir,accessToken,taskId) {
    try {
        console.log(JSON.stringify(dicomdir,null,2));
        const response = await fetch(location, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'X-Chart-Task' : taskId
                    },
                    body: JSON.stringify(dicomdir)
                });

        if (!response.ok) {
            throw new Error('Failed to obtain presigned URL');
        }
        const data = await response.json();
        console.log(JSON.stringify(data,null,2));
        return data;
    } catch (error) {
                console.error('Error obtaining presigned URL:', error);
    }
}
async function uploadDicomCD(location,cloud,accessToken,taskId) {
    const progressBar = document.getElementById('progressBar');
    const currentFileElement = document.getElementById('currentFile');
    let uploadedFiles = 0;
    const totalFiles = files.length;
 
    try {
        if (cloud === 'google')
            dicomdir['cloud'] = cloud;
        const presignedUrls = await getPresignedUrls(location,dicomdir,accessToken,taskId);

        for (let i = 0; i<files.length; i++) {
            const file = files[i];
            const filePath = file.webkitRelativePath || file.name;
            const presignedUrl = presignedUrls[filePath]?.url;
            if (!presignedUrl) {
                console.warn(`No presigned URL for file: ${filePath}`);
                continue;
            }

            currentFileElement.textContent = `Uploading: ${filePath}`;
            // await loadAndViewDicom(i);
            console.log("upload to:",presignedUrl);
            const headers = {
                'Content-Type': 'application/dicom',
                'x-amz-acl': 'bucket-owner-full-control'
            }
            if (cloud === 'google') 
                headers = {
                    'Content-Type' : 'application/dicom'
                }
            const response = await fetch(presignedUrl, {
                method: 'PUT',
                body: file,
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`Failed to upload ${filePath}`);
            }

            uploadedFiles++;
            const progress = (uploadedFiles / totalFiles) * 100;
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `${Math.round(progress)}%`;
        }

        alert('Upload completed successfully!');
    } catch (error) {
        console.error('Upload failed:', error);
        alert(`Upload failed: ${error.message}`);
    } finally {
        currentFileElement.textContent = '';
    }
}
function updateUI() {
    // Update file list
    fileListElement.innerHTML = '';
    currentSeries.forEach((item, index) => {
        const li = document.createElement('li');
        li.textContent = item.filePath;
        li.onclick = () => loadAndViewDicom(index);
        fileListElement.appendChild(li);
    });

    // Update series and image navigation
    updateSeriesIndex();
    updateImageIndex();

    // Enable upload button if files are loaded
    document.querySelector('button').disabled = currentSeries.length === 0;
}
// Initialization of WADO Image Loader
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.webWorkerManager.initialize({
    maxWebWorkers: navigator.hardwareConcurrency || 1,
    startWebWorkersOnDemand: true,
    taskConfiguration: {
        decodeTask: {
            initializeCodecsOnStartup: false,
            usePDFJS: false,
            strict: false
        }
    }
});
