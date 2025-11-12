"""
Shared blob storage I/O utilities for multi-stage pipeline
"""
import logging
import os
import json
from typing import List, Dict, Optional
from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient
from azure.identity import DefaultAzureCredential

logger = logging.getLogger(__name__)

# Environment variables
STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "stailzezle7syi")
STORAGE_ACCOUNT_URL = f"https://{STORAGE_ACCOUNT_NAME}.blob.core.windows.net"

# Container names
CONTAINER_RAW = "finlex-raw"
CONTAINER_PARSED = "finlex-parsed"
CONTAINER_CHUNKS = "finlex-chunks"
CONTAINER_EMBEDDED = "finlex-embedded"
CONTAINER_INDEXED = "finlex-indexed"

# Initialize blob service client with managed identity
_blob_service_client = None

def get_blob_service_client() -> BlobServiceClient:
    """Get or create blob service client with managed identity"""
    global _blob_service_client
    if _blob_service_client is None:
        credential = DefaultAzureCredential()
        _blob_service_client = BlobServiceClient(
            account_url=STORAGE_ACCOUNT_URL,
            credential=credential
        )
    return _blob_service_client

def ensure_container_exists(container_name: str) -> ContainerClient:
    """Ensure container exists, create if not"""
    blob_service_client = get_blob_service_client()
    container_client = blob_service_client.get_container_client(container_name)
    
    try:
        container_client.get_container_properties()
        logger.debug(f"Container '{container_name}' exists")
    except Exception:
        logger.info(f"Creating container '{container_name}'")
        container_client.create_container()
    
    return container_client

def upload_blob(container_name: str, blob_name: str, data: bytes, overwrite: bool = True) -> str:
    """
    Upload data to blob storage
    
    Args:
        container_name: Container name
        blob_name: Blob path (e.g., "2024/1234.xml")
        data: Data to upload (bytes)
        overwrite: Whether to overwrite existing blob
        
    Returns:
        Blob URL
    """
    container_client = ensure_container_exists(container_name)
    blob_client = container_client.get_blob_client(blob_name)
    
    blob_client.upload_blob(data, overwrite=overwrite)
    logger.debug(f"Uploaded: {container_name}/{blob_name} ({len(data)} bytes)")
    
    return blob_client.url

def download_blob(container_name: str, blob_name: str) -> bytes:
    """
    Download blob data
    
    Args:
        container_name: Container name
        blob_name: Blob path
        
    Returns:
        Blob data as bytes
    """
    blob_service_client = get_blob_service_client()
    blob_client = blob_service_client.get_blob_client(container_name, blob_name)
    
    data = blob_client.download_blob().readall()
    logger.debug(f"Downloaded: {container_name}/{blob_name} ({len(data)} bytes)")
    
    return data

def blob_exists(container_name: str, blob_name: str) -> bool:
    """Check if blob exists"""
    try:
        blob_service_client = get_blob_service_client()
        blob_client = blob_service_client.get_blob_client(container_name, blob_name)
        blob_client.get_blob_properties()
        return True
    except Exception:
        return False

def list_blobs(container_name: str, prefix: str = None) -> List[str]:
    """
    List blobs in container with optional prefix filter
    
    Args:
        container_name: Container name
        prefix: Optional prefix filter (e.g., "2024/")
        
    Returns:
        List of blob names
    """
    blob_service_client = get_blob_service_client()
    container_client = blob_service_client.get_container_client(container_name)
    
    blobs = []
    for blob in container_client.list_blobs(name_starts_with=prefix):
        blobs.append(blob.name)
    
    logger.debug(f"Listed {len(blobs)} blobs in {container_name} with prefix '{prefix}'")
    return blobs

def upload_json(container_name: str, blob_name: str, data: Dict, overwrite: bool = True) -> str:
    """Upload JSON object to blob"""
    json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
    return upload_blob(container_name, blob_name, json_bytes, overwrite)

def download_json(container_name: str, blob_name: str) -> Dict:
    """Download and parse JSON from blob"""
    json_bytes = download_blob(container_name, blob_name)
    return json.loads(json_bytes.decode('utf-8'))

def upload_jsonl(container_name: str, blob_name: str, items: List[Dict], overwrite: bool = True) -> str:
    """Upload list of objects as JSONL (one JSON object per line)"""
    lines = [json.dumps(item, ensure_ascii=False) for item in items]
    jsonl_bytes = '\n'.join(lines).encode('utf-8')
    return upload_blob(container_name, blob_name, jsonl_bytes, overwrite)

def download_jsonl(container_name: str, blob_name: str) -> List[Dict]:
    """Download and parse JSONL from blob"""
    jsonl_bytes = download_blob(container_name, blob_name)
    lines = jsonl_bytes.decode('utf-8').strip().split('\n')
    return [json.loads(line) for line in lines if line.strip()]

def mark_indexed(doc_id: str, year: str) -> str:
    """Create marker file indicating document has been indexed"""
    blob_name = f"{year}/{doc_id}.indexed"
    return upload_blob(CONTAINER_INDEXED, blob_name, b'', overwrite=True)

def is_indexed(doc_id: str, year: str) -> bool:
    """Check if document has been indexed"""
    blob_name = f"{year}/{doc_id}.indexed"
    return blob_exists(CONTAINER_INDEXED, blob_name)
