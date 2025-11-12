"""
Chunking module for splitting documents into optimal search chunks
Uses tiktoken for accurate token counting
"""
import logging
import tiktoken
from typing import List, Dict

logger = logging.getLogger(__name__)

# Chunking parameters
MIN_CHUNK_SIZE = 800  # tokens
MAX_CHUNK_SIZE = 1000  # tokens
OVERLAP_SIZE = 100  # tokens
ENCODING_MODEL = "cl100k_base"  # For text-embedding-ada-002

def chunk_documents(documents: List[Dict]) -> List[Dict]:
    """
    Split documents into chunks optimized for search
    
    Args:
        documents: List of parsed document dicts
        
    Returns:
        List of chunk dicts with content, metadata, and references
    """
    encoding = tiktoken.get_encoding(ENCODING_MODEL)
    all_chunks = []
    
    for doc in documents:
        try:
            doc_chunks = chunk_document(doc, encoding)
            all_chunks.extend(doc_chunks)
            logger.debug(f"Document '{doc.get('title', 'unknown')}' split into {len(doc_chunks)} chunks")
        except Exception as e:
            logger.error(f"Failed to chunk document {doc.get('document_id', 'unknown')}: {str(e)}")
    
    logger.info(f"Created {len(all_chunks)} chunks from {len(documents)} documents")
    return all_chunks

def chunk_document(doc: Dict, encoding) -> List[Dict]:
    """
    Chunk a single document preserving section boundaries
    
    Args:
        doc: Parsed document dict
        encoding: Tiktoken encoding
        
    Returns:
        List of chunk dicts
    """
    chunks = []
    chunk_index = 0
    
    # Try section-based chunking first (preserve structure)
    sections = doc.get('sections', [])
    if sections:
        for section in sections:
            section_chunks = chunk_section(doc, section, encoding)
            for chunk in section_chunks:
                chunk['chunk_index'] = chunk_index
                chunks.append(chunk)
                chunk_index += 1
    else:
        # Fallback: chunk full text if no sections
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

def chunk_section(doc: Dict, section: Dict, encoding) -> List[Dict]:
    """
    Chunk a single section, respecting paragraph boundaries
    
    Args:
        doc: Parent document dict
        section: Section dict with heading, paragraphs
        encoding: Tiktoken encoding
        
    Returns:
        List of chunk dicts for this section
    """
    chunks = []
    
    # Build section text
    section_parts = []
    if section.get('heading'):
        section_parts.append(f"## {section['heading']}")
    
    for para in section.get('paragraphs', []):
        section_parts.append(para)
    
    section_text = '\n\n'.join(section_parts)
    
    # Check if section fits in single chunk
    tokens = encoding.encode(section_text)
    if len(tokens) <= MAX_CHUNK_SIZE:
        # Single chunk for this section
        chunks.append(create_chunk_dict(
            doc=doc,
            content=section_text,
            chunk_index=0,
            section_number=section.get('number'),
            section_heading=section.get('heading')
        ))
    else:
        # Split section into multiple chunks
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

def chunk_text(text: str, encoding, min_size: int = MIN_CHUNK_SIZE, 
               max_size: int = MAX_CHUNK_SIZE, overlap: int = OVERLAP_SIZE) -> List[str]:
    """
    Split text into chunks with overlap using token-based splitting
    
    Args:
        text: Text to split
        encoding: Tiktoken encoding
        min_size: Minimum chunk size in tokens
        max_size: Maximum chunk size in tokens
        overlap: Overlap size in tokens
        
    Returns:
        List of text chunks
    """
    tokens = encoding.encode(text)
    
    if len(tokens) <= max_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(tokens):
        # Determine chunk end
        end = min(start + max_size, len(tokens))
        
        # Extract token slice
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        
        # Try to break at sentence boundary if possible
        if end < len(tokens) and len(chunk_tokens) >= min_size:
            # Look for sentence endings in last 20% of chunk
            search_start = int(len(chunk_text) * 0.8)
            sentence_end = find_sentence_boundary(chunk_text, search_start)
            
            if sentence_end > 0:
                chunk_text = chunk_text[:sentence_end]
                # Recalculate tokens for actual chunk
                chunk_tokens = encoding.encode(chunk_text)
                end = start + len(chunk_tokens)
        
        chunks.append(chunk_text)
        
        # Move start forward with overlap
        start = end - overlap if end < len(tokens) else end
    
    return chunks

def find_sentence_boundary(text: str, start_pos: int) -> int:
    """
    Find the nearest sentence boundary after start_pos
    
    Args:
        text: Text to search
        start_pos: Position to start searching from
        
    Returns:
        Position of sentence boundary, or -1 if not found
    """
    # Look for sentence endings: . ! ? followed by space or end
    for i in range(start_pos, len(text)):
        if text[i] in '.!?' and (i + 1 >= len(text) or text[i + 1].isspace()):
            return i + 1
    
    # Fallback: look for paragraph break
    para_pos = text.find('\n\n', start_pos)
    if para_pos > 0:
        return para_pos
    
    return -1

def create_chunk_dict(doc: Dict, content: str, chunk_index: int,
                     section_number: str = None, section_heading: str = None) -> Dict:
    """
    Create chunk dictionary with all required fields
    
    Args:
        doc: Parent document
        content: Chunk text content
        chunk_index: Index within document
        section_number: Section number if applicable
        section_heading: Section heading if applicable
        
    Returns:
        Chunk dict ready for embedding and indexing
    """
    # Generate unique chunk ID
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
