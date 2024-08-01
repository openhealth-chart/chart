import { healthcare } from '@googleapis/healthcare';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs/promises';
import path from 'path';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const healthcareClient = healthcare({
  version: 'v1',
  auth: auth,
});

async function uploadDicomCD(projectId, cloudRegion, datasetId, dicomStoreId, cdPath) {
  const parent = `projects/${projectId}/locations/${cloudRegion}/datasets/${datasetId}/dicomStores/${dicomStoreId}`;
  const dicomWebPath = 'studies';

  try {
    const dicomFiles = await findDicomFiles(cdPath);
    for (const filePath of dicomFiles) {
      await uploadDicomFile(parent, dicomWebPath, filePath);
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

async function uploadDicomFile(parent, dicomWebPath, filePath) {
  try {
    const binaryData = fs.createReadStream(filePath);
    const request = {
      parent,
      dicomWebPath,
      requestBody: binaryData,
    };

    const instance = await healthcareClient.projects.locations.datasets.dicomStores.storeInstances(
      request,
      {
        headers: {
          'Content-Type': 'application/dicom',
          Accept: 'application/dicom+json',
        },
      }
    );

    console.log(`Uploaded: ${path.basename(filePath)}`);
    console.log('Stored DICOM instance:\n', JSON.stringify(instance.data));
  } catch (error) {
    console.error(`Error uploading file ${filePath}:`, error);
  }
}

// Usage
const projectId = 'your-project-id';
const cloudRegion = 'us-central1';
const datasetId = 'your-dataset-id';
const dicomStoreId = 'your-dicom-store-id';
const cdPath = '/path/to/dicom/cd';

uploadDicomCD(projectId, cloudRegion, datasetId, dicomStoreId, cdPath);