"""
Finlex Legal Document Ingestion Pipeline
Orchestrates download, extraction, chunking, embedding, and indexing of Finnish legal documents
"""
import logging
import os
import sys
from datetime import datetime
from download import download_finlex_archive
from extract import extract_xml_files
from parse import parse_finlex_documents
from chunk import chunk_documents
from embed import generate_embeddings
from index import index_to_search

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Environment variables
TARGET_YEARS = os.getenv("TARGET_YEARS", "2024,2025").split(",")
STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
AZURE_SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")

def main():
    """Main orchestration function for Finlex ingestion pipeline"""
    start_time = datetime.now()
    logger.info(f"Starting Finlex ingestion pipeline at {start_time}")
    logger.info(f"Target years: {', '.join(TARGET_YEARS)}")
    
    try:
        # Step 1: Download Finlex archive
        logger.info("=" * 80)
        logger.info("STEP 1: Downloading Finlex archive")
        logger.info("=" * 80)
        archive_path = download_finlex_archive()
        logger.info(f"Archive downloaded to: {archive_path}")
        
        # Step 2: Extract XML files for target years
        logger.info("=" * 80)
        logger.info("STEP 2: Extracting XML files")
        logger.info("=" * 80)
        xml_files = extract_xml_files(archive_path, TARGET_YEARS)
        logger.info(f"Extracted {len(xml_files)} XML files")
        
        # Step 3: Parse documents and extract metadata
        logger.info("=" * 80)
        logger.info("STEP 3: Parsing documents")
        logger.info("=" * 80)
        documents = parse_finlex_documents(xml_files)
        logger.info(f"Parsed {len(documents)} documents")
        
        # Step 4: Chunk documents for optimal search
        logger.info("=" * 80)
        logger.info("STEP 4: Chunking documents")
        logger.info("=" * 80)
        chunks = chunk_documents(documents)
        logger.info(f"Created {len(chunks)} chunks")
        
        # Step 5: Generate embeddings for chunks
        logger.info("=" * 80)
        logger.info("STEP 5: Generating embeddings")
        logger.info("=" * 80)
        chunks_with_embeddings = generate_embeddings(chunks)
        logger.info(f"Generated embeddings for {len(chunks_with_embeddings)} chunks")
        
        # Step 6: Index to Azure AI Search
        logger.info("=" * 80)
        logger.info("STEP 6: Indexing to Azure AI Search")
        logger.info("=" * 80)
        indexed_count = index_to_search(chunks_with_embeddings)
        logger.info(f"Successfully indexed {indexed_count} chunks")
        
        # Summary
        duration = (datetime.now() - start_time).total_seconds()
        logger.info("=" * 80)
        logger.info("PIPELINE COMPLETED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Total execution time: {duration:.2f} seconds ({duration/60:.1f} minutes)")
        logger.info(f"Documents processed: {len(documents)}")
        logger.info(f"Chunks created: {len(chunks)}")
        logger.info(f"Chunks indexed: {indexed_count}")
        
    except Exception as e:
        logger.error("Pipeline failed with error", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
