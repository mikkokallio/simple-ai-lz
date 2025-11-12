import logging
import os
import requests
import zipfile
import tempfile
import time
import traceback
import xml.etree.ElementTree as ET
from azure.storage.blob import BlobServiceClient
import azure.functions as func

# Environment variables
STORAGE_CONNECTION_STRING = os.getenv("AzureWebJobsStorage")
FINLEX_URL = os.getenv("FINLEX_URL")
CONTAINER_NAME = os.getenv("BLOB_CONTAINER_NAME")
TARGET_YEARS = os.getenv("TARGET_YEARS", "2024,2025").split(",")

# Blob client
blob_service_client = BlobServiceClient.from_connection_string(STORAGE_CONNECTION_STRING)
container_client = blob_service_client.get_container_client(CONTAINER_NAME)

# XML cleanup function
def extract_text_from_akn(xml_bytes):
    try:
        root = ET.fromstring(xml_bytes)
        ns = {'akn': 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0'}
        lines = []

        title = root.find('.//akn:docTitle', ns)
        if title is not None and title.text:
            lines.append(title.text.strip())

        for heading in root.findall('.//akn:heading', ns):
            if heading.text:
                lines.append(heading.text.strip())

        for para in root.findall('.//akn:p', ns):
            if para.text:
                lines.append(para.text.strip())

        return '\n'.join(lines)
    except Exception as e:
        logging.error("Failed to parse XML")
        logging.error(traceback.format_exc())
        return None

app = func.FunctionApp()

@app.function_name(name="FinlexIngest")
@app.timer_trigger(schedule="0 0 1 * * *", arg_name="mytimer", run_on_startup=False)
def finlex_ingest(mytimer: func.TimerRequest) -> None:
    start_time = time.time()

    if mytimer.past_due:
        logging.info("The timer is past due!")

    logging.info("Python timer trigger function executed.")

    try:
        logging.info(f"Starting download from {FINLEX_URL}")
        with tempfile.NamedTemporaryFile(delete=False) as tmp_zip:
            response = requests.get(FINLEX_URL, stream=True, timeout=300)
            response.raise_for_status()

            for chunk in response.iter_content(chunk_size=8192):
                tmp_zip.write(chunk)

            tmp_zip_path = tmp_zip.name
            logging.info(f"Download complete. ZIP saved to {tmp_zip_path}")

        with zipfile.ZipFile(tmp_zip_path, 'r') as zip_ref:
            file_list = zip_ref.namelist()
            logging.info(f"Found {len(file_list)} files in the ZIP archive.")

            for file_name in file_list:
                for year in TARGET_YEARS:
                    prefix = f"akn/fi/act/statute-consolidated/{year}/"
                    if file_name.startswith(prefix) and file_name.endswith(".xml"):
                        try:
                            logging.info(f"Opening file: {file_name}")
                            with zip_ref.open(file_name) as file_data:
                                xml_bytes = file_data.read()
                                clean_text = extract_text_from_akn(xml_bytes)
                                if clean_text:
                                    short_name = file_name.replace(prefix, f"{year}/")
                                    blob_client = container_client.get_blob_client(short_name)
                                    logging.info(f"Uploading cleaned text {short_name} to Blob Storage...")
                                    blob_client.upload_blob(clean_text.encode('utf-8'), overwrite=True)
                                    logging.info(f"Successfully uploaded: {short_name}")
                                else:
                                    logging.warning(f"No content extracted from {file_name}")
                        except Exception as file_error:
                            logging.error(f"Error uploading file: {file_name}")
                            logging.error(traceback.format_exc())

    except Exception as e:
        logging.error("Unexpected error during function execution.")
        logging.error(traceback.format_exc())
    finally:
        duration = time.time() - start_time
        logging.info(f"Function execution completed in {duration:.2f} seconds.")