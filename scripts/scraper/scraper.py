import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

USERNAME = "elliottstorey"
PASSWORD = 'seLsCJ=8U"Zm}d+'
OUTPUT   = Path("lsat_data.json")
LETTERS  = ["A", "B", "C", "D", "E"]
TABS     = ".answers-panel-section-title, .answers-panel-section-title-unselected"


def detect_section_type(page):
    page.wait_for_selector('[data-testid="directionsNotes"]')
    dirs = page.inner_text('[data-testid="directionsNotes"]').lower()
    if "brief passage" in dirs:
        return "Logical Reasoning"
    return "Reading Comprehension"


def scrape_question(page):
    stimulus = page.inner_text("#StimulusSection") if page.query_selector("#StimulusSection") else ""
    stem     = page.inner_text("#stemText")
    options  = page.query_selector_all(".drillSetOptionText")
    choices, correct = [], None
    
    for i, opt in enumerate(options):
        letter     = LETTERS[i]
        is_correct = opt.query_selector(".correctText") is not None
        text_el   = opt.query_selector(".HighlightableText__TextContainer-sc-1ea7h6s-0")
        text      = text_el.inner_text().strip() if text_el else ""
        rat_el    = opt.query_selector(f'[data-testid="rationaleParagraph_{i}"] .paragraph')
        rationale = rat_el.inner_text().strip() if rat_el else ""
        
        if is_correct:
            correct = letter
            
        choices.append({"letter": letter, "text": text, "rationale": rationale})
        
    return {"stimulus": stimulus.strip(), "stem": stem.strip(), "answer": correct, "choices": choices}


def parse_score_report(page):
    sections = []
    for i, tab in enumerate(page.query_selector_all(TABS)):
        label = tab.inner_text().strip()
        tab.click()
        page.wait_for_timeout(400)
        questions = []
        
        for row in page.query_selector_all("table.testResults tbody tr"):
            cells = row.query_selector_all("td")
            if len(cells) < 7:
                continue
                
            # Safely extract integer for difficulty check constraint (1-5)
            diff_text = cells[6].inner_text().strip()
            diff_match = re.search(r'\d+', diff_text)
            difficulty = int(diff_match.group()) if diff_match else 1
            
            questions.append({
                "number":     int(cells[0].inner_text().strip()),
                "answer":     cells[4].inner_text().strip(),
                "subtype":    cells[5].inner_text().strip(),
                "difficulty": difficulty,
            })
            
        sections.append({
            "number":        i + 1,
            "type":          None, # Populated later
            "is_variable":   "(*)" in label,
            "passages":      [],   # Populated during review phase for RC
            "questions":     questions,
        })
    return sections


def review_sections(page, sections):
    # enter review from score report: click first tab then Review Section
    page.wait_for_selector(TABS)
    page.query_selector_all(TABS)[0].click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="Review Section").click()
    page.wait_for_selector("#StimulusSection, #stemText")

    for sec_idx, section in enumerate(sections):
        sec_type = section["type"]
        passages_seen = []
        
        for q_idx, q in enumerate(section["questions"]):
            sel = f'[data-testid="answerSelection.{q_idx + 1}"]'
            page.evaluate(f"Array.from(document.querySelectorAll('{sel}')).find(el => el.offsetParent !== null)?.click()")
            page.wait_for_timeout(400)
            
            scraped_q = scrape_question(page)
            
            # Map scraped standard data
            q["stem"]    = scraped_q["stem"]
            q["choices"] = scraped_q["choices"]
            q["type"]    = sec_type
            
            if scraped_q.get("answer"):
                q["answer"] = scraped_q["answer"]
                
            stimulus_text = scraped_q["stimulus"]

            # DB CONSTRAINT LOGIC: 
            # Separate independent Passages for RC vs inline Stimulus for LR
            if sec_type == "Reading Comprehension":
                q["stimulus"] = None
                passage_num = None
                
                # Check if we already created this passage
                for p in passages_seen:
                    if p["text"] == stimulus_text:
                        passage_num = p["number"]
                        break
                        
                # Create new passage if it's the first question of the set
                if not passage_num:
                    passage_num = len(passages_seen) + 1
                    passages_seen.append({
                        "number": passage_num,
                        "text": stimulus_text
                    })
                    
                q["passage_number"] = passage_num
            else:
                q["stimulus"] = stimulus_text
                q["passage_number"] = None

        # Assign the standalone passages back to the section
        section["passages"] = passages_seen

        if sec_idx < len(sections) - 1:
            page.get_by_role("button", name="Next Section").click()
            page.wait_for_selector("#StimulusSection, #stemText")
            
    return sections


def run_test(page, test_name):
    print(f"▶  {test_name}")
    page.get_by_role("button", name="NEW TEST").click()
    page.wait_for_timeout(1000)
    try:
        page.get_by_role("button", name="Use necessary cookies only").click(timeout=5000)
    except PWTimeout:
        pass
        
    page.get_by_role("button", name="START TEST").click()
    page.wait_for_timeout(2000)
    
    section_types = []
    for _ in range(6):
        if page.query_selector(".answers-panel-tab-container"):
            break
            
        section_types.append(detect_section_type(page))
        try:
            page.get_by_role("button", name="Begin").click(timeout=5000)
            page.wait_for_timeout(800)
        except PWTimeout:
            pass
            
        page.get_by_role("button", name="Complete Section").click()
        page.wait_for_timeout(1500)
        
    sections = parse_score_report(page)
    
    for i, s in enumerate(sections):
        if i < len(section_types):
            s["type"] = section_types[i]
            
    sections = review_sections(page, sections)
    
    # Returning "name" instead of "test_name" to map exactly to tests.name
    return {"name": test_name, "sections": sections}


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    page    = browser.new_page()
    page.set_default_timeout(60000)

    page.goto("https://app.lawhub.org/login", wait_until="networkidle")
    page.fill("#logonIdentifier", USERNAME)
    page.fill("#password", PASSWORD)
    page.get_by_role("button", name="Sign In").click()
    page.wait_for_load_state("networkidle")
    page.goto("https://app.lawhub.org/library/fulltests", wait_until="networkidle")

    try:
        page.get_by_role("button", name="Use necessary cookies only").click(timeout=8000)
    except PWTimeout:
        pass

    page.goto("https://app.lawhub.org/library/fulltests", wait_until="networkidle")
    test_names = [
        b.inner_text().strip().splitlines()[0].strip()
        for b in page.query_selector_all("button")
        if "The Official LSAT PrepTest" in b.inner_text()
    ]
    print(f"Found {len(test_names)} PrepTests")

    all_data = []
    for test_name in test_names:
        page.goto("https://app.lawhub.org/library/fulltests", wait_until="networkidle")
        page.wait_for_timeout(800)
        page.locator("button", has_text=test_name).first.click()
        page.wait_for_timeout(1500)
        
        all_data.append(run_test(page, test_name))
        
        OUTPUT.write_text(json.dumps(all_data, indent=2, ensure_ascii=False))
        print(f"  💾 saved ({len(all_data)} tests so far)")

    browser.close()
    print(f"\n✅ Done — {OUTPUT}")