# Regenerating Monster Metadata

The monster metadata can be regenerated to use LLM-powered semantic analysis for accurate keyword assignment.

## Two Methods Available

### Method 1: In-Browser Tool (Recommended)

**Easiest approach** - uses the Spark LLM directly in the browser.

1. Navigate to the **Locations** page in the app
2. Click the **"Start Regeneration"** button in the yellow warning card
3. Wait 10-20 minutes while it processes ~500 monsters in batches
4. A file `monsters-metadata-new.json` will automatically download
5. Replace `/workspaces/spark-template/monsters-metadata.json` with the downloaded file

**Advantages:**
- No API key setup needed
- Uses existing Spark LLM integration
- Shows progress in real-time
- Processes in batches automatically

**Note:** Keep the browser tab open during processing!

### Method 2: Python Script

Alternative approach if you prefer running it separately with your own OpenAI API key.

## Why LLM-based keyword generation?

**Problem with rule-based approach:**
- "rarely seen in urban areas" → incorrectly tagged as `urban`
- "avoids water" → incorrectly tagged as `underwater`
- Context-blind pattern matching

**LLM solution:**
- Understands semantic context
- "city guard" → `urban` ✓
- "rarely in cities" → NOT `urban` ✓
- Each monster gets 3-5 most relevant keywords

## Prerequisites

```bash
# Install dependencies
pip install openai beautifulsoup4

# Set OpenAI API key
export OPENAI_API_KEY='your-key-here'
```

## Running the script

```bash
python generate_monster_metadata.py
```

The script will:
1. Process all HTML files in `monsters/` directory
2. Use GPT-4o-mini to analyze each monster semantically
3. Assign 3-5 keywords from the approved `THEME_KEYWORDS` list
4. Generate `monsters-metadata.json`

**Note:** Processing ~300+ monsters takes 5-10 minutes and costs ~$0.10-0.20 in API fees.

## How it works

### Metadata Generation (Run Once)
```
Monster HTML → LLM Analysis → 3-5 Keywords → monsters-metadata.json
```

### Runtime Filtering (Fast)
```
LLM suggests encounter keywords
  → Filter monsters where ANY keyword matches
  → Rank by match count: 3 matches > 2 matches > 1 match
  → Pass to combo generator
```

## Example

**Monster:** City Guard  
**LLM Analysis:** Assigns `['humanoid', 'military', 'urban', 'soldier', 'lawful']`

**Encounter:** "Suggest monsters for a city tavern brawl"  
**LLM Suggests:** `['urban', 'humanoid', 'criminal']`  
**City Guard Matches:** 2 keywords (urban, humanoid)  
**Ranking:** High priority (2 matches)

## Keyword Distribution

After generation, check statistics:
- Total keywords assigned
- Most common keywords (should be balanced)
- Coverage (most monsters should have 3-5 keywords)
