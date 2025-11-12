"""
Indexing module for uploading documents to Azure AI Search with vector search
"""
import logging
import os
from typing import List, Dict
from azure.core.credentials import AzureKeyCredential
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
    VectorSearchProfile
)

logger = logging.getLogger(__name__)

# Environment variables
AZURE_SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
AZURE_SEARCH_KEY = os.getenv("AZURE_SEARCH_KEY")  # Admin key for index creation
AZURE_OPENAI_DIMENSIONS = int(os.getenv("AZURE_OPENAI_DIMENSIONS", "1536"))  # Vector dimensions
INDEX_NAME = "finlex-documents"
BATCH_SIZE = 1000  # Maximum batch size for Azure Search

def index_to_search(chunks: List[Dict]) -> int:
    """
    Create/update index and upload chunks to Azure AI Search
    
    Args:
        chunks: List of chunks with embeddings
        
    Returns:
        Number of successfully indexed chunks
    """
    if not AZURE_SEARCH_ENDPOINT or not AZURE_SEARCH_KEY:
        raise ValueError("AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_KEY environment variables required")
    
    logger.info(f"Connecting to Azure AI Search: {AZURE_SEARCH_ENDPOINT}")
    
    # Create or update index
    credential = AzureKeyCredential(AZURE_SEARCH_KEY)
    index_client = SearchIndexClient(endpoint=AZURE_SEARCH_ENDPOINT, credential=credential)
    
    ensure_index_exists(index_client)
    
    # Upload documents
    search_client = SearchClient(
        endpoint=AZURE_SEARCH_ENDPOINT,
        index_name=INDEX_NAME,
        credential=credential
    )
    
    indexed_count = 0
    
    # Process in batches
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        
        try:
            logger.debug(f"Uploading batch {i//BATCH_SIZE + 1}/{(len(chunks) + BATCH_SIZE - 1)//BATCH_SIZE}")
            
            # Convert chunks to search documents
            documents = [chunk_to_search_document(chunk) for chunk in batch]
            
            # Upload with merge or upload (upsert) behavior
            result = search_client.upload_documents(documents=documents)
            
            # Count successful uploads
            succeeded = sum(1 for r in result if r.succeeded)
            indexed_count += succeeded
            
            if succeeded < len(batch):
                failed = len(batch) - succeeded
                logger.warning(f"Batch had {failed} failed uploads")
            else:
                logger.debug(f"Successfully uploaded {succeeded} documents")
                
        except Exception as e:
            logger.error(f"Failed to upload batch starting at index {i}: {str(e)}")
            raise
    
    logger.info(f"Successfully indexed {indexed_count} chunks to '{INDEX_NAME}'")
    return indexed_count

def ensure_index_exists(index_client: SearchIndexClient) -> None:
    """
    Create index if it doesn't exist
    
    Args:
        index_client: Azure Search index client
    """
    try:
        existing_index = index_client.get_index(INDEX_NAME)
        logger.info(f"Index '{INDEX_NAME}' already exists")
        return
    except Exception:
        logger.info(f"Creating new index: {INDEX_NAME}")
    
    # Define index schema
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SimpleField(name="document_id", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="document_type", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="title", type=SearchFieldDataType.String),
        SearchableField(name="content", type=SearchFieldDataType.String),
        SearchField(
            name="content_vector",
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            searchable=True,
            vector_search_dimensions=AZURE_OPENAI_DIMENSIONS,
            vector_search_profile_name="vector-profile"
        ),
        SimpleField(name="publication_date", type=SearchFieldDataType.String, filterable=True, sortable=True),
        SimpleField(name="effective_date", type=SearchFieldDataType.String, filterable=True, sortable=True),
        SimpleField(name="year", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="section_number", type=SearchFieldDataType.String),
        SearchableField(name="section_heading", type=SearchFieldDataType.String),
        SimpleField(name="chunk_index", type=SearchFieldDataType.Int32, filterable=True, sortable=True),
        SimpleField(name="last_modified", type=SearchFieldDataType.String)
    ]
    
    # Configure vector search with HNSW algorithm
    vector_search = VectorSearch(
        algorithms=[
            HnswAlgorithmConfiguration(
                name="hnsw-algorithm",
                parameters={
                    "m": 4,
                    "efConstruction": 400,
                    "efSearch": 500,
                    "metric": "cosine"
                }
            )
        ],
        profiles=[
            VectorSearchProfile(
                name="vector-profile",
                algorithm_configuration_name="hnsw-algorithm"
            )
        ]
    )
    
    # Create index
    index = SearchIndex(
        name=INDEX_NAME,
        fields=fields,
        vector_search=vector_search
    )
    
    index_client.create_index(index)
    logger.info(f"Successfully created index '{INDEX_NAME}'")

def chunk_to_search_document(chunk: Dict) -> Dict:
    """
    Convert chunk dict to Azure Search document format
    
    Args:
        chunk: Chunk with all required fields
        
    Returns:
        Dict formatted for Azure Search
    """
    return {
        'id': chunk['id'],
        'document_id': chunk['document_id'],
        'document_type': chunk['document_type'],
        'title': chunk['title'],
        'content': chunk['content'],
        'content_vector': chunk['content_vector'],
        'publication_date': chunk.get('publication_date'),
        'effective_date': chunk.get('effective_date'),
        'year': chunk.get('year'),
        'section_number': chunk.get('section_number'),
        'section_heading': chunk.get('section_heading'),
        'chunk_index': chunk['chunk_index'],
        'last_modified': chunk['last_modified']
    }
