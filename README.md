# PrizmDoc Redact and Split Output Sample

This demo aims to show off some of the available functionality in the PrizmDoc API and Viewer.

## Docker Instructions

```bash
git clone https://github.com/jamisonprianos/pd-split-output-sample.git

cd pd-split-output-sample

docker build . -t pd-split-output-sample:local

docker run -it \
-e PD_SERVER_BASE=https://my.prizmdoc.com:18681 \
--mount src="$(pwd)/input_files",target="/demo/input_files",type=bind \
--mount src="$(pwd)/output_files",target="/demo/output_files",type=bind \
pd-split-output-sample:local
```

### Requirements

- Docker 20+
- A running instance of PrizmDoc 13.26+ accessible from this container

## Basic Steps

- Upload all input files to generate workfiles (`/input_files directory`)
- Combine and flatten all input workfiles to a TIFF
- Convert the combined document into a searchable PDF
- Get a search context for the new document
- Search for PII data within the document
- Create a markup layer from the PII entities
- Burn the generated markup data to the searchable PDF
- Flatten (rasterize) the PDF to secure the redacted content
- Convert back to a searchable PDF using OCR service
- Split the redacted document back to individual files (`/output_files directory`)
- Retrieve the document bytes for the combined document (`/output_files directory`)