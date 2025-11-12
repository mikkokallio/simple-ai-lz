import logging
import os
import requests
import zipfile
import tempfile
import time
import traceback
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from io import BytesIO
from azure.storage.blob import BlobServiceClient
from azure.identity import DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchField,
    SearchFieldDataType,
    VectorSearch,
    HnswAlgorithmConfiguration,
    VectorSearchProfile,
)
from openai import AzureOpenAI
import azure.functions as func

# Environment variables
STORAGE_CONNECTION_STRING = os.getenv("STORAGE_CONNECTION_STRING")
FINLEX_URL = os.getenv("FINLEX_URL", "https://data.finlex.fi/download/kaikki")
BLOB_CONTAINER_NAME = os.getenv("BLOB_CONTAINER_NAME", "finlex-raw")
TARGET_YEARS = os.getenv("TARGET_YEARS", "2024,2025").split(",")
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "text-embedding-3-small")
AZURE_OPENAI_DIMENSIONS = int(os.getenv("AZURE_OPENAI_DIMENSIONS", "1536"))
AZURE_SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
AZURE_SEARCH_INDEX = os.getenv("AZURE_SEARCH_INDEX", "finlex-functions-index")

# Initialize clients with connection strings (like working example)
blob_service_client = BlobServiceClient.from_connection_string(STORAGE_CONNECTION_STRING)
container_client = blob_service_client.get_container_client(BLOB_CONTAINER_NAME)

credential = DefaultAzureCredential()
openai_client = AzureOpenAI(
    api_version="2024-02-01",
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider=lambda: credential.get_token("https://cognitiveservices.azure.com/.default").token
)

# XML cleanup function (from your working code)
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

@app.function_name(name="ingest_function")
@app.route(route="ingest", methods=["GET", "POST"], auth_level=func.AuthLevel.FUNCTION)
def ingest_function(req: func.HttpRequest) -> func.HttpResponse:
    """HTTP trigger - downloads and parses Finlex data to blob storage"""
    start_time = time.time()
    logging.info("Finlex ingest function started")

    try:
        logging.info(f"Starting download from {FINLEX_URL}")
        with tempfile.NamedTemporaryFile(delete=False) as tmp_zip:
            response = requests.get(FINLEX_URL, stream=True, timeout=300)
            response.raise_for_status()

            for chunk in response.iter_content(chunk_size=8192):
                tmp_zip.write(chunk)

            tmp_zip_path = tmp_zip.name
            logging.info(f"Download complete. ZIP saved to {tmp_zip_path}")

        processed_count = 0
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
                                    processed_count += 1
                                else:
                                    logging.warning(f"No content extracted from {file_name}")
                        except Exception as file_error:
                            logging.error(f"Error uploading file: {file_name}")
                            logging.error(traceback.format_exc())

        duration = time.time() - start_time
        message = f"Function execution completed in {duration:.2f} seconds. Processed {processed_count} files."
        logging.info(message)
        return func.HttpResponse(message, status_code=200)

    except Exception as e:
        logging.error("Unexpected error during function execution.")
        logging.error(traceback.format_exc())
        return func.HttpResponse(f"Error: {str(e)}", status_code=500)


def chunk_text(text: str, max_tokens: int = 500, overlap_tokens: int = 50) -> list:
    """Chunk text using character-based estimation (approximates 4 chars = 1 token)."""
    max_chars = max_tokens * 4
    overlap_chars = overlap_tokens * 4
    
    # Split into sentences
    sentences = []
    for line in text.split('\n'):
        line = line.strip()
        if line:
            # Simple sentence splitting
            parts = line.replace('!', '.').replace('?', '.').split('.')
            sentences.extend([s.strip() + '.' for s in parts if s.strip()])
    
    chunks = []
    current_chunk = []
    current_length = 0
    
    for sentence in sentences:
        sentence_length = len(sentence)
        
        if current_length + sentence_length > max_chars and current_chunk:
            # Save current chunk
            chunks.append(' '.join(current_chunk))
            
            # Start new chunk with overlap (last 3 sentences)
            overlap_text = ' '.join(current_chunk[-3:])
            if len(overlap_text) < overlap_chars:
                current_chunk = current_chunk[-3:]
                current_length = len(overlap_text)
            else:
                current_chunk = []
                current_length = 0
        
        current_chunk.append(sentence)
        current_length += sentence_length
    
    if current_chunk:
        chunks.append(' '.join(current_chunk))
    
    return chunks


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings using Azure OpenAI."""
    try:
        response = openai_client.embeddings.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            input=texts,
            dimensions=AZURE_OPENAI_DIMENSIONS
        )
        return [item.embedding for item in response.data]
    except Exception as e:
        logging.error(f"Embedding generation failed: {e}")
        raise


def ensure_search_index():
    """Create AI Search index if it doesn't exist."""
    index_client = SearchIndexClient(
        endpoint=AZURE_SEARCH_ENDPOINT,
        credential=credential
    )
    
    try:
        index_client.get_index(AZURE_SEARCH_INDEX)
        logging.info(f"Index {AZURE_SEARCH_INDEX} already exists")
        return
    except Exception:
        logging.info(f"Creating index {AZURE_SEARCH_INDEX}")
    
    # Define index schema
    fields = [
        SearchField(name="id", type=SearchFieldDataType.String, key=True),
        SearchField(name="doc_id", type=SearchFieldDataType.String, filterable=True),
        SearchField(name="title", type=SearchFieldDataType.String, searchable=True),
        SearchField(name="chunk_id", type=SearchFieldDataType.Int32, filterable=True),
        SearchField(name="content", type=SearchFieldDataType.String, searchable=True),
        SearchField(
            name="embedding",
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            vector_search_dimensions=AZURE_OPENAI_DIMENSIONS,
            vector_search_profile_name="default-profile"
        ),
        SearchField(name="year", type=SearchFieldDataType.String, filterable=True),
        SearchField(name="indexed_at", type=SearchFieldDataType.DateTimeOffset, filterable=True),
    ]
    
    vector_search = VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name="default-algo")],
        profiles=[VectorSearchProfile(name="default-profile", algorithm_configuration_name="default-algo")]
    )
    
    index = SearchIndex(
        name=AZURE_SEARCH_INDEX,
        fields=fields,
        vector_search=vector_search
    )
    
    index_client.create_index(index)
    logging.info(f"Created index {AZURE_SEARCH_INDEX}")


@app.function_name(name="process_function")
@app.route(route="process", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def process_function(req: func.HttpRequest) -> func.HttpResponse:
    """
    HTTP-triggered function: Chunks documents, generates embeddings, indexes to AI Search.
    Call via: POST https://<function-app>.azurewebsites.net/api/process
    Processes all blobs in finlex-raw container
    """
    logging.info(f"Process function started at {datetime.utcnow().isoformat()}")
    
    try:
        # Get container client
        container_client = blob_service_client.get_container_client(BLOB_CONTAINER_NAME)
        
        # List all JSON blobs
        blob_list = [b for b in container_client.list_blobs() if b.name.endswith('.json')]
        logging.info(f"Found {len(blob_list)} JSON blobs to process")
        
        if not blob_list:
            return func.HttpResponse("No JSON blobs found in container", status_code=200)
        
        # Ensure index exists
        ensure_search_index()
        
        total_chunks = 0
        processed_blobs = 0
        
        # Process each blob
        for blob_item in blob_list:
            try:
                # Download blob
                blob_client = container_client.get_blob_client(blob_item.name)
                blob_data = blob_client.download_blob().readall()
                json_content = json.loads(blob_data.decode('utf-8'))
                
                doc_id = json_content.get("id") or json_content.get("number") or blob_item.name
                title = json_content.get("title", "Untitled")
                content = json_content.get("content", "")
                year = blob_item.name.split('/')[0]  # Extract year from path
                
                if not content:
                    logging.warning(f"No content in {blob_item.name}, skipping")
                    continue
                
                # Chunk text
                chunks = chunk_text(content, max_tokens=500, overlap_tokens=50)
                if not chunks:
                    logging.warning(f"No chunks created from {blob_item.name}")
                    continue
                
                # Generate embeddings (batch up to 16 at a time)
                all_embeddings = []
                batch_size = 16
                for i in range(0, len(chunks), batch_size):
                    batch = chunks[i:i + batch_size]
                    embeddings = generate_embeddings(batch)
                    all_embeddings.extend(embeddings)
                
                # Prepare documents for indexing
                documents = []
                for idx, (chunk, embedding) in enumerate(zip(chunks, all_embeddings)):
                    doc = {
                        "id": f"{doc_id}_{idx}".replace('/', '_').replace(':', '_'),
                        "doc_id": doc_id,
                        "title": title,
                        "chunk_id": idx,
                        "content": chunk,
                        "embedding": embedding,
                        "year": year,
                        "indexed_at": datetime.utcnow().isoformat()
                    }
                    documents.append(doc)
                
                # Upload to AI Search
                search_client = SearchClient(
                    endpoint=AZURE_SEARCH_ENDPOINT,
                    index_name=AZURE_SEARCH_INDEX,
                    credential=credential
                )
                
                # Upload in batches of 100
                for i in range(0, len(documents), 100):
                    batch = documents[i:i + 100]
                    result = search_client.upload_documents(documents=batch)
                    succeeded = sum(1 for r in result if r.succeeded)
                
                total_chunks += len(documents)
                processed_blobs += 1
                
                if processed_blobs % 10 == 0:
                    logging.info(f"Processed {processed_blobs}/{len(blob_list)} blobs, {total_chunks} chunks indexed")
                    
            except Exception as e:
                logging.error(f"Error processing {blob_item.name}: {e}")
                continue
        
        message = f"Success: Processed {processed_blobs} blobs, indexed {total_chunks} chunks"
        logging.info(message)
        return func.HttpResponse(message, status_code=200)
        
    except Exception as e:
        logging.error(f"Process function failed: {e}", exc_info=True)
        return func.HttpResponse(f"Error: {str(e)}", status_code=500)
