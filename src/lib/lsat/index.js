// Each array is the slot count for difficulties [1, 2, 3, 4]
// Total = 76 questions (46 LR + 30 RC)
const subtypeWeights = {
    // --- Logical Reasoning (46) ---
    "Techniques, Roles, and Principles": [2, 3, 2, 1], // 8
    "Strengthen or Weaken": [3, 1, 2, 1], // 7
    "Flaws": [2, 3, 2, 0], // 7
    "Assumptions": [1, 1, 4, 1], // 7
    "Deductions and Inference": [1, 3, 1, 1], // 6
    "Conclusions and Disputes": [1, 2, 1, 0], // 4
    "Explain or Resolve": [1, 1, 1, 1], // 4
    "Matching Structure and Principles": [1, 0, 0, 1], // 2
    "Matching Flaws": [0, 1, 1, 0], // 2

    // --- Reading Comprehension (30) ---
    "Drawing Inferences": [1, 2, 3, 2], // 8
    "Recognizing Elements of the Passage": [2, 2, 1, 1], // 6
    "Analyzing how the Parts Work": [1, 2, 1, 1], // 5
    "Identifying Main Points and Primary Purposes": [1, 2, 1, 0], // 4
    "Applying the Argument to New Contexts": [0, 1, 2, 0], // 3
    "Author's Attitude": [1, 0, 1, 0], // 2
    "Meaning in Context": [0, 0, 1, 0], // 1
};

const scale = (raw) => Math.max(120, Math.min(180, 120 + Math.round((raw - 11) * 0.93 + 3.5 * Math.sin((raw / 75) * Math.PI))));

export { subtypeWeights, scale };