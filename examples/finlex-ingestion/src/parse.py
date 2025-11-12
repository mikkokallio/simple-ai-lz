"""
Parse module for processing Finlex Akoma Ntoso (AKN) legal document XML
"""
import logging
import xml.etree.ElementTree as ET
from typing import List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

# AKN namespace
AKN_NS = {'akn': 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0'}

def parse_finlex_documents(xml_files: List[Dict]) -> List[Dict]:
    """
    Parse Finlex XML documents and extract structured content
    
    Args:
        xml_files: List of dicts with 'filename', 'content', 'year', 'short_name'
        
    Returns:
        List of parsed document dicts with metadata and structured content
    """
    documents = []
    
    for xml_file in xml_files:
        try:
            doc = parse_akn_document(xml_file['content'])
            if doc:
                # Add file metadata
                doc['filename'] = xml_file['filename']
                doc['short_name'] = xml_file['short_name']
                doc['year'] = xml_file['year']
                doc['document_id'] = extract_document_id(xml_file['filename'])
                
                documents.append(doc)
                logger.debug(f"Parsed: {xml_file['short_name']}")
            else:
                logger.warning(f"No content extracted from: {xml_file['short_name']}")
                
        except Exception as e:
            logger.error(f"Failed to parse {xml_file.get('short_name', 'unknown')}: {str(e)}")
    
    logger.info(f"Successfully parsed {len(documents)} documents")
    return documents

def parse_akn_document(xml_content: bytes) -> Dict:
    """
    Parse AKN XML document and extract structured content
    
    Args:
        xml_content: Raw XML bytes
        
    Returns:
        Dict with title, sections, metadata
    """
    try:
        root = ET.fromstring(xml_content)
        
        # Extract document title
        title_elem = root.find('.//akn:docTitle', AKN_NS)
        title = title_elem.text.strip() if title_elem is not None and title_elem.text else "Untitled"
        
        # Extract publication date
        pub_date_elem = root.find('.//akn:publication[@date]', AKN_NS)
        pub_date = pub_date_elem.get('date') if pub_date_elem is not None else None
        
        # Extract effective date
        eff_date_elem = root.find('.//akn:FRBRdate[@name="vigencyDate"]', AKN_NS)
        eff_date = eff_date_elem.get('date') if eff_date_elem is not None else None
        
        # Extract document type
        doc_type_elem = root.find('.//akn:FRBRWork/akn:FRBRtype', AKN_NS)
        doc_type = doc_type_elem.get('value') if doc_type_elem is not None else "statute"
        
        # Extract structured sections with hierarchy
        sections = extract_sections(root)
        
        # Build full text for chunking (preserve structure)
        full_text_parts = [f"# {title}\n"]
        for section in sections:
            level = section.get('level', 0)
            indent = "#" * min(level + 2, 6)  # H2-H6
            
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

def extract_sections(root: ET.Element) -> List[Dict]:
    """
    Extract hierarchical sections from AKN document
    
    Args:
        root: XML root element
        
    Returns:
        List of section dicts with headings, paragraphs, hierarchy
    """
    sections = []
    
    # Find all sections, chapters, articles
    for elem in root.findall('.//akn:section', AKN_NS):
        section = extract_section_content(elem, level=1)
        if section:
            sections.append(section)
    
    for elem in root.findall('.//akn:chapter', AKN_NS):
        section = extract_section_content(elem, level=0)
        if section:
            sections.append(section)
    
    for elem in root.findall('.//akn:article', AKN_NS):
        section = extract_section_content(elem, level=2)
        if section:
            sections.append(section)
    
    return sections

def extract_section_content(elem: ET.Element, level: int) -> Dict:
    """
    Extract content from a section element
    
    Args:
        elem: Section XML element
        level: Hierarchy level (0=chapter, 1=section, 2=article)
        
    Returns:
        Dict with heading, paragraphs, level, number
    """
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

def extract_document_id(filename: str) -> str:
    """
    Extract document ID from filename
    
    Args:
        filename: Full file path
        
    Returns:
        Document identifier
    """
    # Extract ID from path like "akn/fi/act/statute-consolidated/2024/1234.xml"
    parts = filename.split('/')
    if len(parts) > 0:
        basename = parts[-1]
        doc_id = basename.replace('.xml', '')
        return doc_id
    return filename
