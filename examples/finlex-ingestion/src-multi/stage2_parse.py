"""
Stage 2: Parse
Reads raw XML files from blob storage, parses AKN structure, writes JSON to blob
"""
import logging
import os
import sys
from datetime import datetime
import xml.etree.ElementTree as ET

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.blob_io import (
    list_blobs, download_blob, upload_json,
    CONTAINER_RAW, CONTAINER_PARSED, blob_exists
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

# AKN namespace
AKN_NS = {'akn': 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0'}

def parse_akn_xml(xml_content: bytes) -> dict:
    """Parse AKN XML and extract structured content"""
    try:
        root = ET.fromstring(xml_content)
        
        # Extract title
        title_elem = root.find('.//akn:docTitle', AKN_NS)
        title = title_elem.text.strip() if title_elem is not None and title_elem.text else "Untitled"
        
        # Extract dates
        pub_date_elem = root.find('.//akn:publication[@date]', AKN_NS)
        pub_date = pub_date_elem.get('date') if pub_date_elem is not None else None
        
        eff_date_elem = root.find('.//akn:FRBRdate[@name="vigencyDate"]', AKN_NS)
        eff_date = eff_date_elem.get('date') if eff_date_elem is not None else None
        
        # Extract document type
        doc_type_elem = root.find('.//akn:FRBRWork/akn:FRBRtype', AKN_NS)
        doc_type = doc_type_elem.get('value') if doc_type_elem is not None else "statute"
        
        # Extract sections
        sections = []
        
        # Find sections
        for elem in root.findall('.//akn:section', AKN_NS):
            section = extract_section_content(elem, level=1)
            if section and section.get('paragraphs'):
                sections.append(section)
        
        # Find chapters
        for elem in root.findall('.//akn:chapter', AKN_NS):
            section = extract_section_content(elem, level=0)
            if section and section.get('paragraphs'):
                sections.append(section)
        
        # Find articles
        for elem in root.findall('.//akn:article', AKN_NS):
            section = extract_section_content(elem, level=2)
            if section and section.get('paragraphs'):
                sections.append(section)
        
        # Build full text
        full_text_parts = [f"# {title}\n"]
        for section in sections:
            level = section.get('level', 0)
            indent = "#" * min(level + 2, 6)
            
            if section.get('heading'):
                full_text_parts.append(f"\n{indent} {section['heading']}\n")
            
            for para in section.get('paragraphs', []):
                full_text_parts.append(f"{para}\n")
        
        full_text = '\n'.join(full_text_parts)
        
        return {
            'title': title,
            'document_type': doc_type,
            'publication_date': pub_date,
            'effective_date': eff_date,
            'sections': sections,
            'full_text': full_text,
            'last_modified': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"XML parsing error: {str(e)}")
        return None

def extract_section_content(elem: ET.Element, level: int) -> dict:
    """Extract content from a section element"""
    # Extract section number
    num_elem = elem.find('.//akn:num', AKN_NS)
    number = num_elem.text.strip() if num_elem is not None and num_elem.text else None
    
    # Extract heading
    heading_elem = elem.find('.//akn:heading', AKN_NS)
    heading = heading_elem.text.strip() if heading_elem is not None and heading_elem.text else None
    
    # Extract paragraphs
    paragraphs = []
    for para in elem.findall('.//akn:p', AKN_NS):
        if para.text:
            text = para.text.strip()
            if text:
                paragraphs.append(text)
    
    return {
        'level': level,
        'number': number,
        'heading': heading,
        'paragraphs': paragraphs
    }

def process_document(blob_name: str, year: str) -> bool:
    """Process a single XML document"""
    try:
        # Extract document ID from blob name
        doc_id = blob_name.split('/')[-1].replace('.xml', '')
        
        # Check if already parsed
        output_blob = f"{year}/{doc_id}.json"
        if SKIP_EXISTING and blob_exists(CONTAINER_PARSED, output_blob):
            logger.debug(f"Skipping {doc_id} (already parsed)")
            return True
        
        # Download XML
        xml_content = download_blob(CONTAINER_RAW, blob_name)
        
        # Parse
        parsed_doc = parse_akn_xml(xml_content)
        if not parsed_doc:
            logger.warning(f"Failed to parse {blob_name}")
            return False
        
        # Add metadata
        parsed_doc['document_id'] = doc_id
        parsed_doc['year'] = year
        parsed_doc['source_blob'] = blob_name
        
        # Upload JSON
        upload_json(CONTAINER_PARSED, output_blob, parsed_doc)
        
        logger.debug(f"Parsed: {doc_id}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to process {blob_name}: {str(e)}")
        return False

def main():
    """Main function for Stage 2"""
    start_time = datetime.now()
    logger.info("=" * 80)
    logger.info("STAGE 2: Parse")
    logger.info("=" * 80)
    
    try:
        total_processed = 0
        total_failed = 0
        
        for year in TARGET_YEARS:
            logger.info(f"Processing year: {year}")
            
            # List all XML files for this year
            prefix = f"{year}/"
            blobs = list_blobs(CONTAINER_RAW, prefix=prefix)
            logger.info(f"Found {len(blobs)} XML files")
            
            processed = 0
            failed = 0
            
            for blob_name in blobs:
                if process_document(blob_name, year):
                    processed += 1
                else:
                    failed += 1
                
                if (processed + failed) % 100 == 0:
                    logger.info(f"Progress: {processed + failed}/{len(blobs)}")
            
            logger.info(f"Year {year}: {processed} parsed, {failed} failed")
            total_processed += processed
            total_failed += failed
        
        # Summary
        duration = (datetime.now() - start_time).total_seconds()
        logger.info("=" * 80)
        logger.info("STAGE 2 COMPLETED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Duration: {duration:.1f} seconds ({duration/60:.1f} minutes)")
        logger.info(f"Documents parsed: {total_processed}")
        logger.info(f"Failed: {total_failed}")
        logger.info(f"Location: {CONTAINER_PARSED}/{{year}}/{{docid}}.json")
        
        if total_failed > 0:
            logger.warning(f"{total_failed} documents failed to parse")
        
    except Exception as e:
        logger.error("Stage 2 failed", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
