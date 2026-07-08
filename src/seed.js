import { chromium } from 'playwright';

const USERNAME = 'elliottstorey';
const PASSWORD = 'seLsCJ=8U"Zm}d+';

// Helper to gracefully attempt clicks without throwing on timeouts
const clickSoft = (page, name) => page.getByRole('button', { name }).click({ timeout: 4000 }).catch(() => {});

async function scrapeQuestion(page) {
    const stimulus = await page.locator('#StimulusSection').innerText().catch(() => '');
    const stem = await page.locator('#stemText').innerText();
    
    // Batch extract all choices directly in the browser
    const choices = await page.locator('.drillSetOptionText').evaluateAll(opts => 
        opts.map((opt, i) => ({
            letter: ['A', 'B', 'C', 'D', 'E'][i],
            text: opt.querySelector('.HighlightableText__TextContainer-sc-1ea7h6s-0')?.innerText.trim() || '',
            rationale: opt.querySelector(`[data-testid="rationaleParagraph_${i}"] .paragraph`)?.innerText.trim() || '',
            isCorrect: !!opt.querySelector('.correctText')
        }))
    );

    return {
        stimulus: stimulus.trim(),
        stem: stem.trim(),
        answer: choices.find(c => c.isCorrect)?.letter,
        choices: choices.map(({ isCorrect, ...c }) => c) // Strip flag before returning
    };
}

export default async function seed({ db }) {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    console.log('Authenticating & fetching tests...');
    await page.goto('https://app.lawhub.org/login');
    await page.fill('#logonIdentifier', USERNAME);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForLoadState('networkidle');

    await page.goto('https://app.lawhub.org/library/fulltests', { waitUntil: 'networkidle' });
    await clickSoft(page, 'Use necessary cookies only');

    const testNames = await page.locator('button:has-text("The Official LSAT PrepTest")')
        .evaluateAll(btns => btns.map(b => b.innerText.split('\n')[0].trim()));
    
    console.log(`Found ${testNames.length} tests. Starting pipeline...\n`);

    for (const name of testNames) {
        await page.goto('https://app.lawhub.org/library/fulltests', { waitUntil: 'networkidle' });
        await page.locator(`button:has-text("${name}")`).first().click();
        await page.getByRole('button', { name: 'NEW TEST' }).click();
        await clickSoft(page, 'Use necessary cookies only');
        await page.getByRole('button', { name: 'START TEST' }).click();

        // 1. Blindly run sections until score report appears (using dynamic while-loop)
        const secTypes = [];
        while (!(await page.locator('.answers-panel-tab-container').count())) {
            await page.waitForSelector('[data-testid="directionsNotes"]');
            const isLR = (await page.locator('[data-testid="directionsNotes"]').innerText()).includes('brief passage');
            secTypes.push(isLR ? 'Logical Reasoning' : 'Reading Comprehension');
            
            await clickSoft(page, 'Begin');
            await page.getByRole('button', { name: 'Complete Section' }).click();
        }

        // 2. Parse Score Report
        const tabs = await page.locator('.answers-panel-section-title, .answers-panel-section-title-unselected').all();
        const sections = [];

        for (const [i, tab] of tabs.entries()) {
            await tab.click();
            await page.waitForTimeout(400);
            
            const questions = await page.locator('table.testResults tbody tr').evaluateAll(rows => 
                rows.map(r => {
                    const cells = r.querySelectorAll('td');
                    return cells.length > 6 ? {
                        number: +cells[0].innerText,
                        answer: cells[4].innerText.trim(),
                        subtype: cells[5].innerText.trim(),
                        difficulty: +(cells[6].innerText.match(/\d+/)?.[0] || 1)
                    } : null;
                }).filter(Boolean)
            );

            sections.push({ 
                number: i + 1, 
                type: secTypes[i], 
                is_variable: (await tab.innerText()).includes('(*)'), 
                passages: [], 
                questions 
            });
        }

        // 3. Review Mode: Scrape real text & answers
        await tabs[0].click();
        await page.getByRole('button', { name: 'Review Section' }).click();

        for (const [i, sec] of sections.entries()) {
            for (const [j, q] of sec.questions.entries()) {
                await page.evaluate(sel => document.querySelector(sel)?.click(), `[data-testid="answerSelection.${j + 1}"]`);
                await page.waitForTimeout(300);

                const data = await scrapeQuestion(page);
                Object.assign(q, { stem: data.stem, choices: data.choices, answer: data.answer || q.answer });

                if (sec.type === 'Reading Comprehension') {
                    let passage = sec.passages.find(p => p.text === data.stimulus);
                    if (!passage) sec.passages.push(passage = { number: sec.passages.length + 1, text: data.stimulus });
                    
                    q.passage_number = passage.number;
                    q.stimulus = null;
                } else {
                    q.stimulus = data.stimulus;
                    q.passage_number = null;
                }
            }
            if (i < sections.length - 1) await page.getByRole('button', { name: 'Next Section' }).click();
        }

        // 4. Seed to DB concurrently using functional mapping
        try {
            await db.begin(async (tx) => {
                const [{ id: testId }] = await tx`INSERT INTO tests (name) VALUES (${name}) RETURNING id`;

                // Run section inserts concurrently
                await Promise.all(sections.filter(s => s.number <= 4).map(async (sec) => {
                    const [{ id: secId }] = await tx`
                        INSERT INTO sections (test_id, number, type, is_variable)
                        VALUES (${testId}, ${sec.number}, ${sec.type}, ${sec.is_variable}) RETURNING id`;

                    const pMap = {};
                    if (sec.type === 'Reading Comprehension') {
                        // Insert passages concurrently
                        await Promise.all(sec.passages.map(async (p) => {
                            const [{ id: pId }] = await tx`INSERT INTO passages (text) VALUES (${p.text}) RETURNING id`;
                            pMap[p.number] = pId;
                            await tx`INSERT INTO section_passages (section_id, passage_id, number) VALUES (${secId}, ${pId}, ${p.number})`;
                        }));
                    }

                    // Insert questions concurrently
                    await Promise.all(sec.questions.map(async (q) => {
                        const isLR = sec.type === 'Logical Reasoning';
                        const [{ id: qId }] = await tx`
                            INSERT INTO questions (type, subtype, passage_id, stimulus, stem, answer, difficulty) 
                            VALUES (${sec.type}, ${q.subtype}, ${isLR ? null : pMap[q.passage_number]}, ${isLR ? q.stimulus : null}, ${q.stem}, ${q.answer}, ${q.difficulty}) RETURNING id`;

                        await tx`INSERT INTO section_questions (section_id, question_id, number) VALUES (${secId}, ${qId}, ${q.number})`;
                        
                        if (q.choices?.length) {
                            const choices = q.choices.map(c => ({ question_id: qId, ...c }));
                            await tx`INSERT INTO choices ${tx(choices, 'question_id', 'letter', 'text', 'rationale')}`;
                        }
                    }));
                }));
            });
            console.log(`✓ ${name} seeded`);
        } catch (err) {
            console.error(`✗ DB Error [${name}]:`, err.message);
        }
    }

    console.log('\nPipeline complete. Shutting down.');
    await browser.close();
}