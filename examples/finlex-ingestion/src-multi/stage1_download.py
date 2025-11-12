"""
Stage 1: Download and Extract
Downloads Finlex ZIP archive, extracts XML files, uploads to blob storage
"""
import logging
import os
import sys
import tempfile
import zipfile
from datetime import datetime
import requests

# Add parent directory to path for shared imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.blob_io import upload_blob, CONTAINER_RAW, ensure_container_exists

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Environment variables
FINLEX_URL = os.getenv("FINLEX_URL", "https://data.finlex.fi/download/kaikki")
TARGET_YEARS = os.getenv("TARGET_YEARS", "2024,2025").split(",")

def download_archive() -> str:
    """Download Finlex ZIP archive to temp file"""
    logger.info(f"Downloading from {FINLEX_URL}")
    
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    tmp_path = tmp_file.name
    
    try:
        response = requests.get(FINLEX_URL, stream=True, timeout=300)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        if total_size:
            logger.info(f"Archive size: {total_size / (1024*1024):.2f} MB")
        
        downloaded = 0
        chunk_size = 8192
        for chunk in response.iter_content(chunk_size=chunk_size):
            tmp_file.write(chunk)
            downloaded += len(chunk)
            
            if downloaded % (10 * 1024 * 1024) == 0:
                logger.info(f"Downloaded: {downloaded / (1024*1024):.2f} MB")
        
        tmp_file.close()
        logger.info(f"Download complete: {tmp_path}")
        return tmp_path
        
    except Exception as e:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        logger.error(f"Download failed: {str(e)}")
        raise

def extract_and_upload(archive_path: str, target_years: list) -> dict:
    """
    Extract XML files from archive and upload to blob storage
    
    Returns:
        Dict with statistics
    """
    logger.info(f"Processing archive: {archive_path}")
    logger.info(f"Target years: {', '.join(target_years)}")
    
    # Ensure container exists
    ensure_container_exists(CONTAINER_RAW)
    
    stats = {
        'files_found': 0,
        'files_uploaded': 0,
        'bytes_uploaded': 0,
        'years': {},
        'errors': []
    }
    
    try:
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            file_list = zip_ref.namelist()
            logger.info(f"Archive contains {len(file_list)} files")
            
            for file_name in file_list:
                # Check if file matches target year pattern
                for year in target_years:
                    prefix = f"akn/fi/act/statute-consolidated/{year}/"
                    if file_name.startswith(prefix) and file_name.endswith(".xml"):
                        stats['files_found'] += 1
                        
                        try:
                            # Extract file content
                            with zip_ref.open(file_name) as file_data:
                                xml_content = file_data.read()
                            
                            # Extract document ID from filename
                            doc_id = file_name.split('/')[-1].replace('.xml', '')
                            
                            # Upload to blob storage: finlex-raw/{year}/{docid}.xml
                            blob_name = f"{year}/{doc_id}.xml"
                            upload_blob(CONTAINER_RAW, blob_name, xml_content)
                            
                            stats['files_uploaded'] += 1
                            stats['bytes_uploaded'] += len(xml_content)
                            
                            # Track per-year stats
                            if year not in stats['years']:
                                stats['years'][year] = 0
                            stats['years'][year] += 1
                            
                            if stats['files_uploaded'] % 100 == 0:
                                logger.info(f"Uploaded {stats['files_uploaded']} files...")
                                
                        except Exception as e:
                            error_msg = f"Failed to process {file_name}: {str(e)}"
                            logger.error(error_msg)
                            stats['errors'].append(error_msg)
        
        logger.info(f"Extraction complete")
        logger.info(f"Files found: {stats['files_found']}")
        logger.info(f"Files uploaded: {stats['files_uploaded']}")
        logger.info(f"Total bytes: {stats['bytes_uploaded'] / (1024*1024):.2f} MB")
        
        for year, count in stats['years'].items():
            logger.info(f"  {year}: {count} files")
        
        if stats['errors']:
            logger.warning(f"Encountered {len(stats['errors'])} errors")
            
    except Exception as e:
        logger.error(f"Failed to process archive: {str(e)}")
        raise
    finally:
        # Clean up archive file
        if os.path.exists(archive_path):
            os.unlink(archive_path)
            logger.info(f"Cleaned up archive: {archive_path}")
    
    return stats

def main():
    """Main function for Stage 1"""
    start_time = datetime.now()
    logger.info("=" * 80)
    logger.info("STAGE 1: Download & Extract")
    logger.info("=" * 80)
    
    try:
        # Step 1: Download archive
        archive_path = download_archive()
        
        # Step 2: Extract and upload to blob storage
        stats = extract_and_upload(archive_path, TARGET_YEARS)
        
        # Summary
        duration = (datetime.now() - start_time).total_seconds()
        logger.info("=" * 80)
        logger.info("STAGE 1 COMPLETED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        logger.info(f"Files uploaded: {stats['files_uploaded']}")
        logger.info(f"Data uploaded: {stats['bytes_uploaded'] / (1024*1024):.2f} MB")
        logger.info(f"Location: {CONTAINER_RAW}/{{year}}/{{docid}}.xml")
        
    except Exception as e:
        logger.error("Stage 1 failed", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
