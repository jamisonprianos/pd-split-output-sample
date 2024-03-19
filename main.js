import fs from 'fs';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const uploadInputs = async () => {
  const files = fs.readdirSync('./input_files');
  if (!files.length) {
    console.error('You must have at least one file in your input_files directory');
    process.exit(1);
  }
  return Promise.all(files.map(async (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    const contentType = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      eml: 'text/plain',
      pdf: 'application/pdf'
    }[extension] || 'application/octet-stream';
    const inputStream = fs.createReadStream(`./input_files/${filename}`);
    const fileId = await uploadWorkfile(inputStream, contentType, extension);
    const contextId = await createSearchContext(fileId);
    const contextInfo = await getSearchContextInfo(contextId);
    return { filename, extension, fileId, pages: contextInfo.pages.length };
  }));
};

const uploadWorkfile = async (inputStream, contentType, extension) => {
  const url = `${process.env.PD_SERVER_BASE}/PCCIS/V1/WorkFile?FileExtension=${extension}`;
  const response = await fetch(url, {
    body: inputStream,
    headers: {
      'content-type': contentType
    },
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('Workfile creation failed');
  }
  const body = await response.json();
  return body.fileId;
};

const awaitProcessCompletion = async (processUrl, processId) => {
  const url = `${process.env.PD_SERVER_BASE}/${processUrl}/${processId}`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error(`Checking status of ${processUrl} failed`);
  }
  const { output, state } = await response.json();
  if (state === 'processing') {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return awaitProcessCompletion(processUrl, processId);
  }
  if (state === 'complete') {
    return output;
  }
  throw new Error(`${processType} process state unexpected: ${state}`);
};

const combineDocuments = async (inputWorkfileIds) => {
  const url = `${process.env.PD_SERVER_BASE}/v2/contentConverters`;
  const input = {
    sources: inputWorkfileIds.map((fileId) => ({ fileId })),
    dest: {
      format: 'tiff'
    }
  };
  const response = await fetch(url, {
    body: JSON.stringify({ input }),
    headers: {
      'content-type': 'application/json;charset=utf-8'
    },
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('Document combine process failed');
  }
  const { processId } = await response.json();
  const output = await awaitProcessCompletion('v2/contentConverters', processId);
  const { results } = output;
  return results[0].fileId;
};

const createSearchablePdf = async (inputWorkfileId) => {
  const url = `${process.env.PD_SERVER_BASE}/v2/contentConverters`;
  const input = {
    sources: [
      { fileId: inputWorkfileId }
    ],
    dest: {
      format: 'pdf',
      pdfOptions: {
        ocr: {
          language: 'english'
        }
      }
    }
  };
  const response = await fetch(url, {
    body: JSON.stringify({ input }),
    headers: {
      'content-type': 'application/json;charset=utf-8'
    },
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('Content conversion process creation failed');
  }
  const { processId } = await response.json();
  const output = await awaitProcessCompletion('v2/contentConverters', processId);
  const { results } = output;
  return results[0].fileId;
};

const createFlattenedPdf = async (inputWorkfileId) => {
  const url = `${process.env.PD_SERVER_BASE}/v2/contentConverters`;
  const input = {
    sources: [
      { fileId: inputWorkfileId }
    ],
    dest: {
      format: 'tiff'
    }
  };
  const response = await fetch(url, {
    body: JSON.stringify({ input }),
    headers: {
      'content-type': 'application/json;charset=utf-8'
    },
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('Content conversion process creation failed');
  }
  const { processId } = await response.json();
  const output = await awaitProcessCompletion('v2/contentConverters', processId);
  const { results } = output;
  return results[0].fileId;
};

const createSearchContext = async (workfileId) => {
  const url = `${process.env.PD_SERVER_BASE}/v2/searchContexts`;
  const input = {
    documentIdentifier: uuidv4(),
    fileId: workfileId,
    source: 'workFile'
  };
  const response = await fetch(url, {
    body: JSON.stringify({ input }),
    headers: {
      'content-type': 'application/json;charset=utf-8'
    },
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('Search context creation failed');
  }
  const { contextId } = await response.json();
  await awaitProcessCompletion('v2/searchContexts', contextId);
  return contextId;
};

const getSearchContextInfo = async (contextId) => {
  const url = `${process.env.PD_SERVER_BASE}/v2/searchContexts/${contextId}/records?pages=0-`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error(`Retrieving info from search context ${contextId} failed`);
  }
  const body = await response.json();
  return body;
};

const performPiiSearch = async (contextId) => {
  const url = `${process.env.PD_SERVER_BASE}/v2/piiDetectors`;
  const input = { contextId };
  const response = await fetch(url, {
    body: JSON.stringify({ input }),
    headers: {
      'content-type': 'application/json;charset=utf-8'
    },
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('PII detector creation failed');
  }
  const { processId } = await response.json();
  await awaitProcessCompletion('v2/piiDetectors', processId);
  
  const getUrl = `${process.env.PD_SERVER_BASE}/v2/piiDetectors/${processId}/entities`;
  const getResponse = await fetch(getUrl);
  if (!getResponse.ok) {
    const error = await getResponse.json();
    console.error(error);
    throw new Error('PII detection process failed');
  }
  const { entities } = await getResponse.json();
  return entities;
};

const createMarkupLayer = async (entities) => {
  const markupData = {
    marks: entities.reduce((result, entity) => ([
      ...result,
      ...entity.lineGroups[0].lines.map((rect) => ({
        uid: uuidv4(),
        interactionMode: 'SelectionDisabled',
        pageNumber: entity.pageIndex + 1,
        type: 'RectangleAnnotation',
        creationDateTime: '2024-01-01T00:00:00.000Z',
        modificationDateTime: '2024-01-01T00:00:00.000Z',
        data: {},
        rectangle: rect,
        pageData: entity.lineGroups[0].pageData,
        borderColor: '#000000',
        borderThickness: 4,
        fillColor: '#000000',
        opacity: 255
      }))
    ]), [])
  };
  const body = Buffer.from(JSON.stringify(markupData, null, 2), { encoding: 'utf-8' });
  return uploadWorkfile(body, 'application/octet-stream', 'json');
};

const burnMarkup = async (documentFileId, markupFileId) => {
  const url = `${process.env.PD_SERVER_BASE}/PCCIS/V1/MarkupBurner`;
  const input = { documentFileId, markupFileId };
  const response = await fetch(url, {
    body: JSON.stringify({ input }),
    headers: {
      'content-type': 'application/json;charset=utf-8'
    },
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('Markup burner creation failed');
  }
  const { processId } = await response.json();
  const output = await awaitProcessCompletion('PCCIS/V1/MarkupBurner', processId);
  return output.documentFileId;
};

const getWorkfileBytes = async (workfileId) => {
  const url = `${process.env.PD_SERVER_BASE}/PCCIS/V1/WorkFile/${workfileId}`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('Retrieving workfile bytes failed');
  }
  return response.blob();
};

const getSpecifiedPages = async (workfileId, pages) => {
  const url = `${process.env.PD_SERVER_BASE}/v2/contentConverters`;
  const input = {
    sources: [
      { fileId: workfileId, pages }
    ],
    dest: {
      format: 'pdf'
    }
  };
  const response = await fetch(url, {
    body: JSON.stringify({ input }),
    headers: {
      'content-type': 'application/json;charset=utf-8'
    },
    method: 'POST'
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    throw new Error('Page extraction process creation failed');
  }
  const { processId } = await response.json();
  const output = await awaitProcessCompletion('v2/contentConverters', processId);
  const { results } = output;
  return results[0].fileId;
};

const splitDocument = async (workfileId, inputFiles) => {
  let startPage = 1;
  let promises = [];
  for (const file of inputFiles) {
    const start = startPage;
    const end = startPage + file.pages - 1;
    startPage += file.pages;
    promises.push((async () => {
      const fileId = await getSpecifiedPages(workfileId, `${start}-${end}`);
      const burnedDocumentBytes = await getWorkfileBytes(fileId);
      const array = await burnedDocumentBytes.arrayBuffer();
      const filename = file.filename.replace(new RegExp(`${file.extension}$`), 'pdf');
      fs.writeFileSync(`./output_files/${filename}`, Buffer.from(array));
      console.log({ outputFile: `./output_files/${filename}` });
    })());
  }
  await Promise.all(promises);
};

if (!process.env.PD_SERVER_BASE) {
  console.error('PD_SERVER_BASE environment variable must be set');
  process.exit(1);
}

// Upload all input files to generate workfiles
const inputWorkfiles = await uploadInputs();
console.dir(inputWorkfiles, { depth: null });

// Combine and flatten all input workfiles to a TIFF
const combinedWorkfileId = await combineDocuments(inputWorkfiles.map((d) => d.fileId));
console.log({ combinedWorkfileId });

// Convert the combined document into a searchable PDF
const searchableWorkfileId = await createSearchablePdf(combinedWorkfileId);
console.log({ searchableWorkfileId });

// Get a search context for the new document
const searchContextId = await createSearchContext(searchableWorkfileId);
console.log({ searchContextId });

// Search for PII data within the document
const piiEntities = await performPiiSearch(searchContextId);
console.log({ entityCount: piiEntities.length });

// Create a markup layer from the PII entities
const markupFileId = await createMarkupLayer(piiEntities);
console.log({ markupFileId });

// Burn the generated markup data to the searchable PDF
const burnedDocumentId = await burnMarkup(combinedWorkfileId, markupFileId);
console.log({ burnedDocumentId });

// Flatten (rasterize) the PDF to secure the redacted content
const flattenedWorkfileId = await createFlattenedPdf(burnedDocumentId);
console.log({ flattenedWorkfileId });

// Convert back to a searchable PDF using OCR service
const finalWorkfileId = await createSearchablePdf(flattenedWorkfileId);
console.log({ finalWorkfileId });

// Split the redacted document back to individual files
await splitDocument(finalWorkfileId, inputWorkfiles);

// Retrieve the document bytes for the combined document
const burnedDocumentBytes = await getWorkfileBytes(finalWorkfileId);
const array = await burnedDocumentBytes.arrayBuffer();
fs.writeFileSync('./output_files/__combined.pdf', Buffer.from(array));
console.log({ outputFile: './output_files/__combined.pdf' });