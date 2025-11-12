"""
Stage 3: Chunk
Reads parsed JSON documents, chunks text optimally, writes JSONL to blob
"""
import logging
import os
import sys
from datetime import datetime
import tiktoken

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.blob_io import (
    list_blobs, download_json, upload_jsonl,
    CONTAINER_PARSED, CONTAINER_CHUNKS, blob_exists
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
MIN_CHUNK_SIZE = int(os.getenv("MIN_CHUNK_SIZE", "800"))
MAX_CHUNK_SIZE = int(os.getenv("MAX_CHUNK_SIZE", "1000"))
OVERLAP_SIZE = int(os.getenv("OVERLAP_SIZE", "100"))

# Encoding for token counting
ENCODING_MODEL = "cl100k_base"

def chunk_document(doc: dict, encoding) -> list:
    """Chunk a document into optimal search chunks"""
    chunks = []
    chunk_index = 0
    
    # Try section-based chunking
    sections = doc.get('sections', [])
    if sections:
        for section in sections:
            section_chunks = chunk_section(doc, section, encoding)
            for chunk in section_chunks:
                chunk['chunk_index'] = chunk_index
                chunks.append(chunk)
                chunk_index += 1
    else:
        # Fallback: chunk full text
        full_text = doc.get('full_text', '')
        if full_text:
            text_chunks = chunk_text(full_text, encoding)
            for i, text in enumerate(text_chunks):
                chunks.append(create_chunk_dict(
                    doc=doc,
                    content=text,
                    chunk_index=i,
                    section_number=None,
                    section_heading=None
                ))
    
    return chunks

def chunk_section(doc: dict, section: dict, encoding) -> list:
    """Chunk a single section"""
    chunks = []
    
    # Build section text
    section_parts = []
    if section.get('heading'):
        section_parts.append(f"## {section['heading']}")
    
    for para in section.get('paragraphs', []):
        section_parts.append(para)
    
    section_text = '\n\n'.join(section_parts)
    
    # Check if fits in single chunk
    tokens = encoding.encode(section_text)
    if len(tokens) <= MAX_CHUNK_SIZE:
        chunks.append(create_chunk_dict(
            doc=doc,
            content=section_text,
            chunk_index=0,
            section_number=section.get('number'),
            section_heading=section.get('heading')
        ))
    else:
        # Split into multiple chunks
        text_chunks = chunk_text(section_text, encoding)
        for i, chunk_text in enumerate(text_chunks):
            chunks.append(create_chunk_dict(
                doc=doc,
                content=chunk_text,
                chunk_index=i,
                section_number=section.get('number'),
                section_heading=section.get('heading')
            ))
    
    return chunks

def chunk_text(text: str, encoding) -> list:
    """Split text into chunks with overlap"""
    tokens = encoding.encode(text)
    
    if len(tokens) <= MAX_CHUNK_SIZE:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(tokens):
        end = min(start + MAX_CHUNK_SIZE, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        
        # Try to break at sentence boundary
        if end < len(tokens) and len(chunk_tokens) >= MIN_CHUNK_SIZE:
            search_start = int(len(chunk_text) * 0.8)
            sentence_end = find_sentence_boundary(chunk_text, search_start)
            
            if sentence_end > 0:
                chunk_text = chunk_text[:sentence_end]
                chunk_tokens = encoding.encode(chunk_text)
                end = start + len(chunk_tokens)
        
        chunks.append(chunk_text)
        start = end - OVERLAP_SIZE if end < len(tokens) else end
    
    return chunks

def find_sentence_boundary(text: str, start_pos: int) -> int:
    """Find nearest sentence boundary"""
    for i in range(start_pos, len(text)):
        if text[i] in '.!?' and (i + 1 >= len(text) or text[i + 1].isspace()):
            return i + 1
    
    # Fallback: paragraph break
    para_pos = text.find('\n\n', start_pos)
    if para_pos > 0:
        return para_pos
    
    return -1

def create_chunk_dict(doc: dict, content: str, chunk_index: int,
                     section_number: str = None, section_heading: str = None) -> dict:
    """Create chunk dictionary"""
    chunk_id = f"{doc['document_id']}_chunk_{chunk_index}"
    
    return {
        'id': chunk_id,
        'document_id': doc['document_id'],
        'document_type': doc.get('document_type', 'statute'),
        'title': doc['title'],
        'content': content,
        'publication_date': doc.get('publication_date'),
        'effective_date': doc.get('effective_date'),
        'year': doc.get('year'),
        'section_number': section_number,
        'section_heading': section_heading,
        'chunk_index': chunk_index,
        'last_modified': doc.get('last_modified')
    }

def process_document(blob_name: str, year: str, encoding) -> int:
    """Process a single document"""
    try:
        doc_id = blob_name.split('/')[-1].replace('.json', '')
        
        # Check if already chunked
        output_blob = f"{year}/{doc_id}.jsonl"
        if SKIP_EXISTING and blob_exists(CONTAINER_CHUNKS, output_blob):
            logger.debug(f"Skipping {doc_id} (already chunked)")
            return 0
        
        # Download parsed document
        doc = download_json(CONTAINER_PARSED, blob_name)
        
        # Chunk the document
        chunks = chunk_document(doc, encoding)
        
        if not chunks:
            logger.warning(f"No chunks created for {doc_id}")
            return 0
        
        # Upload chunks as JSONL
        upload_jsonl(CONTAINER_CHUNKS, output_blob, chunks)
        
        logger.debug(f"Chunked {doc_id}: {len(chunks)} chunks")
        return len(chunks)
        
    except Exception as e:
        logger.error(f"Failed to process {blob_name}: {str(e)}")
        return 0

def main():
    """Main function for Stage 3"""
    start_time = datetime.now()
    logger.info("=" * 80)
    logger.info("STAGE 3: Chunk")
    logger.info("=" * 80)
    logger.info(f"Chunk size: {MIN_CHUNK_SIZE}-{MAX_CHUNK_SIZE} tokens")
    logger.info(f"Overlap: {OVERLAP_SIZE} tokens")
    
    try:
        encoding = tiktoken.get_encoding(ENCODING_MODEL)
        
        total_docs = 0
        total_chunks = 0
        
        for year in TARGET_YEARS:
            logger.info(f"Processing year: {year}")
            
            # List all parsed JSON files
            prefix = f"{year}/"
            blobs = list_blobs(CONTAINER_PARSED, prefix=prefix)
            logger.info(f"Found {len(blobs)} parsed documents")
            
            docs_processed = 0
            chunks_created = 0
            
            for blob_name in blobs:
                chunk_count = process_document(blob_name, year, encoding)
                if chunk_count > 0:
                    docs_processed += 1
                    chunks_created += chunk_count
                
                if (docs_processed % 100) == 0 and docs_processed > 0:
                    logger.info(f"Progress: {docs_processed}/{len(blobs)} docs, {chunks_created} chunks")
            
            logger.info(f"Year {year}: {docs_processed} docs, {chunks_created} chunks")
            total_docs += docs_processed
            total_chunks += chunks_created
        
        # Summary
        duration = (datetime.now() - start_time).total_seconds()
        logger.info("=" * 80)
        logger.info("STAGE 3 COMPLETED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        logger.info(f"Documents chunked: {total_docs}")
        logger.info(f"Chunks created: {total_chunks}")
        logger.info(f"Avg chunks/doc: {total_chunks/total_docs:.1f}" if total_docs > 0 else "N/A")
        logger.info(f"Location: {CONTAINER_CHUNKS}/{{year}}/{{docid}}.jsonl")
        
    except Exception as e:
        logger.error("Stage 3 failed", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
