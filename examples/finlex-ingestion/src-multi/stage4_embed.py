"""
Stage 4: Embed
Reads chunked documents, generates embeddings via Azure OpenAI, writes embedded chunks
"""
import logging
import os
import sys
from datetime import datetime
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.blob_io import (
    list_blobs, download_jsonl, upload_jsonl,
    CONTAINER_CHUNKS, CONTAINER_EMBEDDED, blob_exists
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
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "text-embedding-3-small")
AZURE_OPENAI_DIMENSIONS = int(os.getenv("AZURE_OPENAI_DIMENSIONS", "1536"))
BATCH_SIZE = 16  # Azure OpenAI max per request

# Initialize OpenAI client
token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default"
)

client = AzureOpenAI(
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider=token_provider,
    api_version="2024-02-01"
)

def generate_embeddings_batch(chunks: list) -> list:
    """Generate embeddings for a batch of chunks"""
    if not chunks:
        return []
    
    texts = [chunk['content'] for chunk in chunks]
    
    try:
        response = client.embeddings.create(
            model=AZURE_OPENAI_DEPLOYMENT,
            input=texts,
            dimensions=AZURE_OPENAI_DIMENSIONS
        )
        
        # Add embeddings to chunks
        for i, chunk in enumerate(chunks):
            embedding = response.data[i].embedding
            
            if len(embedding) != AZURE_OPENAI_DIMENSIONS:
                logger.warning(f"Unexpected embedding dimension: {len(embedding)}, expected {AZURE_OPENAI_DIMENSIONS}")
            
            chunk['content_vector'] = embedding
        
        return chunks
        
    except Exception as e:
        logger.error(f"Failed to generate embeddings: {str(e)}")
        raise

def process_document(blob_name: str, year: str) -> int:
    """Process a single document's chunks"""
    try:
        doc_id = blob_name.split('/')[-1].replace('.jsonl', '')
        
        # Check if already embedded
        output_blob = f"{year}/{doc_id}.jsonl"
        if SKIP_EXISTING and blob_exists(CONTAINER_EMBEDDED, output_blob):
            logger.debug(f"Skipping {doc_id} (already embedded)")
            return 0
        
        # Download chunks
        chunks = download_jsonl(CONTAINER_CHUNKS, blob_name)
        
        if not chunks:
            logger.warning(f"No chunks found for {doc_id}")
            return 0
        
        # Process in batches
        embedded_chunks = []
        for i in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[i:i + BATCH_SIZE]
            embedded_batch = generate_embeddings_batch(batch)
            embedded_chunks.extend(embedded_batch)
            
            logger.debug(f"{doc_id}: Embedded batch {i//BATCH_SIZE + 1}/{(len(chunks) + BATCH_SIZE - 1)//BATCH_SIZE}")
        
        # Upload embedded chunks
        upload_jsonl(CONTAINER_EMBEDDED, output_blob, embedded_chunks)
        
        logger.debug(f"Embedded {doc_id}: {len(embedded_chunks)} chunks")
        return len(embedded_chunks)
        
    except Exception as e:
        logger.error(f"Failed to process {blob_name}: {str(e)}")
        return 0

def main():
    """Main function for Stage 4"""
    start_time = datetime.now()
    logger.info("=" * 80)
    logger.info("STAGE 4: Embed")
    logger.info("=" * 80)
    logger.info(f"Model: {AZURE_OPENAI_DEPLOYMENT}")
    logger.info(f"Dimensions: {AZURE_OPENAI_DIMENSIONS}")
    logger.info(f"Batch size: {BATCH_SIZE}")
    
    try:
        total_docs = 0
        total_chunks = 0
        
        for year in TARGET_YEARS:
            logger.info(f"Processing year: {year}")
            
            # List all chunked documents
            prefix = f"{year}/"
            blobs = list_blobs(CONTAINER_CHUNKS, prefix=prefix)
            logger.info(f"Found {len(blobs)} chunked documents")
            
            docs_processed = 0
            chunks_embedded = 0
            
            for blob_name in blobs:
                chunk_count = process_document(blob_name, year)
                if chunk_count > 0:
                    docs_processed += 1
                    chunks_embedded += chunk_count
                
                if (docs_processed % 10) == 0 and docs_processed > 0:
                    logger.info(f"Progress: {docs_processed}/{len(blobs)} docs, {chunks_embedded} chunks")
            
            logger.info(f"Year {year}: {docs_processed} docs, {chunks_embedded} chunks")
            total_docs += docs_processed
            total_chunks += chunks_embedded
        
        # Summary
        duration = (datetime.now() - start_time).total_seconds()
        logger.info("=" * 80)
        logger.info("STAGE 4 COMPLETED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        logger.info(f"Documents embedded: {total_docs}")
        logger.info(f"Chunks embedded: {total_chunks}")
        logger.info(f"Avg speed: {total_chunks/(duration/60):.1f} chunks/min" if duration > 0 else "N/A")
        logger.info(f"Location: {CONTAINER_EMBEDDED}/{{year}}/{{docid}}.jsonl")
        
    except Exception as e:
        logger.error("Stage 4 failed", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
