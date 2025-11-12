"""
Extract module for processing ZIP archives containing Finlex legal documents
"""
import logging
import os
import zipfile
from typing import List, Dict

logger = logging.getLogger(__name__)

def extract_xml_files(archive_path: str, target_years: List[str]) -> List[Dict[str, any]]:
    """
    Extract XML files from Finlex archive for specified years
    
    Args:
        archive_path: Path to downloaded ZIP archive
        target_years: List of years to extract (e.g., ["2024", "2025"])
        
    Returns:
        List of dicts with 'filename', 'content' (bytes), and 'year'
    """
    xml_files = []
    
    try:
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            file_list = zip_ref.namelist()
            logger.info(f"Archive contains {len(file_list)} files")
            
            for file_name in file_list:
                # Check if file matches target year pattern
                for year in target_years:
                    prefix = f"akn/fi/act/statute-consolidated/{year}/"
                    if file_name.startswith(prefix) and file_name.endswith(".xml"):
                        try:
                            logger.debug(f"Extracting: {file_name}")
                            with zip_ref.open(file_name) as file_data:
                                xml_content = file_data.read()
                                
                                xml_files.append({
                                    'filename': file_name,
                                    'content': xml_content,
                                    'year': year,
                                    'short_name': file_name.replace(prefix, f"{year}/")
                                })
                        except Exception as e:
                            logger.error(f"Failed to extract {file_name}: {str(e)}")
            
            logger.info(f"Extracted {len(xml_files)} XML files for years: {', '.join(target_years)}")
            
    except Exception as e:
        logger.error(f"Failed to process archive: {str(e)}")
        raise
    finally:
        # Clean up archive file
        if os.path.exists(archive_path):
            os.unlink(archive_path)
            logger.debug(f"Cleaned up archive: {archive_path}")
    
    return xml_files
