"""
Stage 5: Index
Reads embedded chunks, uploads to Azure AI Search, tracks indexed documents
"""
import logging
import os
import sys
from datetime import datetime
from azure.core.credentials import AzureKeyCredential
from azure.identity import DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SimpleField,
    SearchableField,
    SearchField,
    SearchFieldDataType,
    VectorSearch,
    HnswAlgorithmConfiguration,
    VectorSearchProfile,
)

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.blob_io import (
    list_blobs, download_jsonl, upload_json,
    CONTAINER_EMBEDDED, CONTAINER_INDEXED
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Environment variables
TARGET_YEARS = os.getenv("TARGET_YEARS", "2024,2025").split(",")
SKIP_EXISTING = os.getenv("SKIP_EXISTING", "true").lower() == "true"
AZURE_SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
AZURE_SEARCH_INDEX = os.getenv("AZURE_SEARCH_INDEX", "finlex-index")
AZURE_OPENAI_DIMENSIONS = int(os.getenv("AZURE_OPENAI_DIMENSIONS", "1536"))
BATCH_SIZE = 100  # AI Search batch upload limit

# Initialize Search clients
credential = DefaultAzureCredential()
index_client = SearchIndexClient(
    endpoint=AZURE_SEARCH_ENDPOINT,
    credential=credential
)
search_client = SearchClient(
    endpoint=AZURE_SEARCH_ENDPOINT,
    index_name=AZURE_SEARCH_INDEX,
    credential=credential
)

def ensure_index_exists():
    """Create search index if it doesn't exist"""
    try:
        existing_index = index_client.get_index(AZURE_SEARCH_INDEX)
        logger.info(f"Index '{AZURE_SEARCH_INDEX}' already exists")
        return
    except:
        pass  # Index doesn't exist, create it
    
    logger.info(f"Creating index: {AZURE_SEARCH_INDEX}")
    
    # Define index schema
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True, filterable=True),
        SearchableField(name="title", type=SearchFieldDataType.String),
        SearchableField(name="content", type=SearchFieldDataType.String),
        SimpleField(name="statute_type", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="statute_number", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="year", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="section", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="chunk_id", type=SearchFieldDataType.String, filterable=True),
        SearchField(
            name="content_vector",
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            searchable=True,
            vector_search_dimensions=AZURE_OPENAI_DIMENSIONS,
            vector_search_profile_name="myHnswProfile"
        ),
    ]
    
    # Define vector search configuration
    vector_search = VectorSearch(
        algorithms=[
            HnswAlgorithmConfiguration(name="myHnsw")
        ],
        profiles=[
            VectorSearchProfile(
                name="myHnswProfile",
                algorithm_configuration_name="myHnsw",
            )
        ]
    )
    
    # Create index
    index = SearchIndex(
        name=AZURE_SEARCH_INDEX,
        fields=fields,
        vector_search=vector_search
    )
    
    index_client.create_index(index)
    logger.info(f"Index '{AZURE_SEARCH_INDEX}' created successfully")

def upload_batch(documents: list) -> int:
    """Upload a batch of documents to AI Search"""
    if not documents:
        return 0
    
    try:
        result = search_client.upload_documents(documents=documents)
        
        succeeded = sum(1 for r in result if r.succeeded)
        failed = len(result) - succeeded
        
        if failed > 0:
            logger.warning(f"Batch upload: {succeeded} succeeded, {failed} failed")
            for r in result:
                if not r.succeeded:
                    logger.error(f"Failed to upload {r.key}: {r.error_message}")
        else:
            logger.debug(f"Batch upload: {succeeded} documents")
        
        return succeeded
        
    except Exception as e:
        logger.error(f"Batch upload failed: {str(e)}")
        return 0

def process_document(blob_name: str, year: str) -> int:
    """Process a single document's embedded chunks"""
    try:
        doc_id = blob_name.split('/')[-1].replace('.jsonl', '')
        
        # Download embedded chunks
        chunks = download_jsonl(CONTAINER_EMBEDDED, blob_name)
        
        if not chunks:
            logger.warning(f"No embedded chunks found for {doc_id}")
            return 0
        
        # Upload in batches
        total_uploaded = 0
        for i in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[i:i + BATCH_SIZE]
            uploaded = upload_batch(batch)
            total_uploaded += uploaded
        
        # Record indexed document
        metadata = {
            "doc_id": doc_id,
            "year": year,
            "chunks": len(chunks),
            "indexed_at": datetime.now().isoformat(),
            "source_blob": blob_name
        }
        upload_json(CONTAINER_INDEXED, f"{year}/{doc_id}.json", metadata)
        
        logger.debug(f"Indexed {doc_id}: {total_uploaded}/{len(chunks)} chunks")
        return total_uploaded
        
    except Exception as e:
        logger.error(f"Failed to process {blob_name}: {str(e)}")
        return 0

def main():
    """Main function for Stage 5"""
    start_time = datetime.now()
    logger.info("=" * 80)
    logger.info("STAGE 5: Index")
    logger.info("=" * 80)
    logger.info(f"Index: {AZURE_SEARCH_INDEX}")
    logger.info(f"Vector dimensions: {AZURE_OPENAI_DIMENSIONS}")
    
    try:
        # Ensure index exists
        ensure_index_exists()
        
        total_docs = 0
        total_chunks = 0
        
        for year in TARGET_YEARS:
            logger.info(f"Processing year: {year}")
            
            # List all embedded documents
            prefix = f"{year}/"
            blobs = list_blobs(CONTAINER_EMBEDDED, prefix=prefix)
            logger.info(f"Found {len(blobs)} embedded documents")
            
            docs_indexed = 0
            chunks_indexed = 0
            
            for blob_name in blobs:
                chunk_count = process_document(blob_name, year)
                if chunk_count > 0:
                    docs_indexed += 1
                    chunks_indexed += chunk_count
                
                if (docs_indexed % 10) == 0 and docs_indexed > 0:
                    logger.info(f"Progress: {docs_indexed}/{len(blobs)} docs, {chunks_indexed} chunks")
            
            logger.info(f"Year {year}: {docs_indexed} docs, {chunks_indexed} chunks")
            total_docs += docs_indexed
            total_chunks += chunks_indexed
        
        # Summary
        duration = (datetime.now() - start_time).total_seconds()
        logger.info("=" * 80)
        logger.info("STAGE 5 COMPLETED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        logger.info(f"Documents indexed: {total_docs}")
        logger.info(f"Chunks indexed: {total_chunks}")
        logger.info(f"Avg speed: {total_chunks/(duration/60):.1f} chunks/min" if duration > 0 else "N/A")
        logger.info(f"Index: {AZURE_SEARCH_INDEX} at {AZURE_SEARCH_ENDPOINT}")
        
    except Exception as e:
        logger.error("Stage 5 failed", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
