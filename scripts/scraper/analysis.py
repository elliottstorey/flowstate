import json
from collections import defaultdict, Counter

with open("lsat_data.json") as f:
    data = json.load(f)

# Flatten all scored questions
all_q = [
    {**q, "section_type": s["section_type"], "test": t["test_name"], "is_variable": s["is_variable"]}
    for t in data
    for s in t["sections"]
    if not s["is_variable"]
    for q in s["questions"]
]

lr_q  = [q for q in all_q if q["section_type"] == "LR"]
rc_q  = [q for q in all_q if q["section_type"] == "RC"]

def pct(n, d): return f"{100*n/d:.1f}%" if d else "n/a"

def answer_dist(questions):
    c = Counter(q["correct_answer"] for q in questions)
    total = sum(c.values())
    return {k: f"{c[k]} ({pct(c[k], total)})" for k in "ABCDE"}

def by_difficulty(questions):
    d = defaultdict(list)
    for q in questions: d[q["difficulty"]].append(q)
    return d

def by_subtype(questions):
    d = defaultdict(list)
    for q in questions: d[q["subtype"]].append(q)
    return d

# ── 1. Overview ───────────────────────────────────────────────────────────────
print("=" * 60)
print("OVERVIEW")
print("=" * 60)
for t in data:
    scored = [s for s in t["sections"] if not s["is_variable"]]
    var    = next(s for s in t["sections"] if s["is_variable"])
    total_q = sum(len(s["questions"]) for s in scored)
    print(f"\n{t['test_name']}")
    print(f"  Scored sections : {', '.join(s['tab_label'] + ' (' + s['section_type'] + ')' for s in scored)}")
    print(f"  Variable section: {var['tab_label']} ({var['section_type']})")
    print(f"  Total scored Qs : {total_q}")

# ── 2. Correct answer distribution ───────────────────────────────────────────
print("\n" + "=" * 60)
print("CORRECT ANSWER DISTRIBUTION (scored sections)")
print("=" * 60)
print("\nOverall:")
for k, v in answer_dist(all_q).items(): print(f"  {k}: {v}")
print("\nLR only:")
for k, v in answer_dist(lr_q).items(): print(f"  {k}: {v}")
print("\nRC only:")
for k, v in answer_dist(rc_q).items(): print(f"  {k}: {v}")

# ── 3. Difficulty breakdown ───────────────────────────────────────────────────
print("\n" + "=" * 60)
print("DIFFICULTY BREAKDOWN (scored sections)")
print("=" * 60)
diff_groups = by_difficulty(all_q)
total = len(all_q)
for level in ["Level 1", "Level 2", "Level 3", "Level 4"]:
    qs = diff_groups[level]
    print(f"\n{level}: {len(qs)} questions ({pct(len(qs), total)})")
    ans = Counter(q["correct_answer"] for q in qs)
    for k in "ABCDE": print(f"  {k}: {ans[k]} ({pct(ans[k], len(qs))})")

# ── 4. Subtype breakdown ──────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("LR QUESTION SUBTYPES (scored sections)")
print("=" * 60)
lr_subtypes = by_subtype(lr_q)
for sub, qs in sorted(lr_subtypes.items(), key=lambda x: -len(x[1])):
    diff = Counter(q["difficulty"] for q in qs)
    diff_str = "  ".join(f"L{i}: {diff.get(f'Level {i}', 0)}" for i in range(1,5))
    print(f"  {sub:<45} n={len(qs):3d}  [{diff_str}]")

print("\n" + "=" * 60)
print("RC QUESTION SUBTYPES (scored sections)")
print("=" * 60)
rc_subtypes = by_subtype(rc_q)
for sub, qs in sorted(rc_subtypes.items(), key=lambda x: -len(x[1])):
    diff = Counter(q["difficulty"] for q in qs)
    diff_str = "  ".join(f"L{i}: {diff.get(f'Level {i}', 0)}" for i in range(1,5))
    print(f"  {sub:<45} n={len(qs):3d}  [{diff_str}]")

# ── 5. Per-test answer distribution ──────────────────────────────────────────
print("\n" + "=" * 60)
print("CORRECT ANSWER DISTRIBUTION BY TEST")
print("=" * 60)
for t in data:
    qs = [q for s in t["sections"] if not s["is_variable"] for q in s["questions"]]
    print(f"\n{t['test_name']} (n={len(qs)})")
    for k, v in answer_dist(qs).items(): print(f"  {k}: {v}")

# ── 6. Difficulty by section type ─────────────────────────────────────────────
print("\n" + "=" * 60)
print("DIFFICULTY BY SECTION TYPE")
print("=" * 60)
for stype, qs in [("LR", lr_q), ("RC", rc_q)]:
    print(f"\n{stype} (n={len(qs)})")
    for level in ["Level 1", "Level 2", "Level 3", "Level 4"]:
        n = sum(1 for q in qs if q["difficulty"] == level)
        print(f"  {level}: {n} ({pct(n, len(qs))})")

# ── 7. Subtype x difficulty heatmap (LR) ─────────────────────────────────────
print("\n" + "=" * 60)
print("LR SUBTYPE x DIFFICULTY COUNT")
print("=" * 60)
levels = ["Level 1", "Level 2", "Level 3", "Level 4"]
print(f"  {'Subtype':<45} {'L1':>5} {'L2':>5} {'L3':>5} {'L4':>5} {'Total':>7}")
print("  " + "-" * 75)
for sub, qs in sorted(lr_subtypes.items(), key=lambda x: -len(x[1])):
    diff = Counter(q["difficulty"] for q in qs)
    counts = [diff.get(l, 0) for l in levels]
    print(f"  {sub:<45} {counts[0]:>5} {counts[1]:>5} {counts[2]:>5} {counts[3]:>5} {len(qs):>7}")

# ── 8. Correct answer by position in section ─────────────────────────────────
print("\n" + "=" * 60)
print("CORRECT ANSWER BY QUESTION POSITION (LR, all tests)")
print("=" * 60)
pos_answers = defaultdict(list)
for t in data:
    for s in t["sections"]:
        if s["is_variable"] or s["section_type"] != "LR": continue
        for q in s["questions"]:
            pos_answers[q["question_number"]].append(q["correct_answer"])
for pos in sorted(pos_answers):
    c = Counter(pos_answers[pos])
    top = c.most_common(1)[0]
    bar = "".join(k * v for k, v in sorted(c.items()))
    print(f"  Q{pos:>2}: {dict(c)}  most common={top[0]}({top[1]})")