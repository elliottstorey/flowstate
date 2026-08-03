const subtypeWeights = {
    "Flaws": 8,
    "Strengthen or Weaken": 8,
    "Assumptions": 8,
    "Deductions and Inference": 7,
    "Techniques, Roles, and Principles": 5,
    "Explain or Resolve": 4,
    "Conclusions and Disputes": 4,
    "Matching Structure and Principles": 3,
    "Matching Flaws": 3,
    "Identifying Main Points and Primary Purposes": 7,
    "Drawing Inferences": 7,
    "Recognizing Elements of the Passage": 5,
    "Meaning in Context": 3,
    "Analyzing how the Parts Work": 2,
    "Applying the Argument to New Contexts": 1,
    "Author's Attitude": 1
};

const scale = (raw) => Math.max(120, Math.min(180, 120 + Math.round((raw - 11) * 0.93 + 3.5 * Math.sin((raw / 75) * Math.PI))));

export { subtypeWeights, scale };