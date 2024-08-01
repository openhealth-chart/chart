import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dicomParser from 'https://cdn.jsdelivr.net/npm/dicom-parser@1.8.21/dist/dicomParser.min.js';//dicom-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function uploadDicomCD(baseUrl, cdPath) {
  try {
    const dicomFiles = await findDicomFiles(cdPath);
    for (const filePath of dicomFiles) {
      await uploadDicomFile(baseUrl, filePath);
    }
    console.log('All DICOM files uploaded successfully');
  } catch (error) {
    console.error('Error uploading DICOM CD:', error);
  }
}

async function findDicomFiles(dir) {
  let results = [];
  const list = await fs.readdir(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      results = results.concat(await findDicomFiles(filePath));
    } else if (file.toLowerCase().endsWith('.dcm') || file.toLowerCase() === 'dicomdir') {
      results.push(filePath);
    }
  }
  return results;
}

async function uploadDicomFile(baseUrl, filePath) {
  try {
    const dicomData = await fs.readFile(filePath);
    const dataSet = dicomParser.parseDicom(dicomData);

    const studyInstanceUID = dataSet.string('x0020000d');
    const seriesInstanceUID = dataSet.string('x0020000e');
    const sopInstanceUID = dataSet.string('x00080018');

    if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
      throw new Error('Missing required DICOM tags');
    }

    const uploadUrl = `${baseUrl}/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances/${sopInstanceUID}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/dicom',
      },
      body: dicomData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log(`Uploaded: ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`Error uploading file ${filePath}:`, error);
  }
}

// Usage
const baseUrl = 'https://your-dicomweb-server.com';
const cdPath = '/path/to/dicom/cd';

uploadDicomCD(baseUrl, cdPath);