"""
Embedding module for generating vector embeddings using Azure OpenAI
"""
import logging
import os
from typing import List, Dict
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

logger = logging.getLogger(__name__)

# Environment variables
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "text-embedding-3-small")
AZURE_OPENAI_DIMENSIONS = int(os.getenv("AZURE_OPENAI_DIMENSIONS", "1536"))  # 1536, 768, or 512 for v3 models
BATCH_SIZE = 16  # Azure OpenAI allows max 16 inputs per request

# Initialize Azure OpenAI client with managed identity
token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default"
)

client = AzureOpenAI(
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider=token_provider,
    api_version="2024-02-01"
)

def generate_embeddings(chunks: List[Dict]) -> List[Dict]:
    """
    Generate embeddings for all chunks using Azure OpenAI
    
    Args:
        chunks: List of chunk dicts with 'content' field
        
    Returns:
        List of chunks with added 'content_vector' field (1536-dim embedding)
    """
    if not AZURE_OPENAI_ENDPOINT:
        raise ValueError("AZURE_OPENAI_ENDPOINT environment variable not set")
    
    logger.info(f"Generating embeddings for {len(chunks)} chunks")
    logger.info(f"Using deployment: {AZURE_OPENAI_DEPLOYMENT}")
    
    chunks_with_embeddings = []
    
    # Process in batches
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        batch_texts = [chunk['content'] for chunk in batch]
        
        try:
            # Generate embeddings for batch
            logger.debug(f"Processing batch {i//BATCH_SIZE + 1}/{(len(chunks) + BATCH_SIZE - 1)//BATCH_SIZE}")
            
            response = client.embeddings.create(
                model=AZURE_OPENAI_DEPLOYMENT,
                input=batch_texts,
                dimensions=AZURE_OPENAI_DIMENSIONS  # Specify dimensions for v3 models
            )
            
            # Add embeddings to chunks
            for j, chunk in enumerate(batch):
                embedding = response.data[j].embedding
                
                # Verify embedding dimensions
                if len(embedding) != AZURE_OPENAI_DIMENSIONS:
                    logger.warning(f"Unexpected embedding dimension: {len(embedding)}, expected {AZURE_OPENAI_DIMENSIONS}")
                
                chunk['content_vector'] = embedding
                chunks_with_embeddings.append(chunk)
            
            logger.debug(f"Generated embeddings for {len(batch)} chunks")
            
        except Exception as e:
            logger.error(f"Failed to generate embeddings for batch starting at index {i}: {str(e)}")
            raise
    
    logger.info(f"Successfully generated {len(chunks_with_embeddings)} embeddings")
    return chunks_with_embeddings
