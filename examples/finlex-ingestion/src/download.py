"""
Download module for Finlex legal document archives
"""
import logging
import os
import tempfile
import requests

logger = logging.getLogger(__name__)

# Environment variables
FINLEX_URL = os.getenv("FINLEX_URL")

def download_finlex_archive() -> str:
    """
    Download Finlex archive from configured URL
    
    Returns:
        str: Path to downloaded archive file
    """
    if not FINLEX_URL:
        raise ValueError("FINLEX_URL environment variable not set")
    
    logger.info(f"Starting download from {FINLEX_URL}")
    
    # Create temporary file for download
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    tmp_path = tmp_file.name
    
    try:
        # Download with streaming to handle large files
        response = requests.get(FINLEX_URL, stream=True, timeout=300)
        response.raise_for_status()
        
        # Get total size if available
        total_size = int(response.headers.get('content-length', 0))
        if total_size:
            logger.info(f"Archive size: {total_size / (1024*1024):.2f} MB")
        
        # Write to file in chunks
        downloaded = 0
        chunk_size = 8192
        for chunk in response.iter_content(chunk_size=chunk_size):
            tmp_file.write(chunk)
            downloaded += len(chunk)
            
            # Log progress every 10 MB
            if downloaded % (10 * 1024 * 1024) == 0:
                logger.info(f"Downloaded: {downloaded / (1024*1024):.2f} MB")
        
        tmp_file.close()
        logger.info(f"Download complete. Archive saved to {tmp_path}")
        return tmp_path
        
    except Exception as e:
        # Clean up on error
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        logger.error(f"Download failed: {str(e)}")
        raise
