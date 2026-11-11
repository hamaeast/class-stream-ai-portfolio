/*
 * Fictional sample data for the Class Stream demo. The worksheet text stands in
 * for a teacher's Google Doc; no real documents, students, or schools appear.
 * Every "AI" response is PRERECORDED for illustration, written by hand. None is
 * output captured from a live model call.
 */
window.DemoData = {
  lesson: { title: 'Phase 2 · Lesson 5 — String Literals and Variables (sample)' },

  // What a teacher's two Google Docs might contain (practice + answer key).
  practiceDoc: [
    'Practice — String Literals and Variables',
    'Point goal: 8 points',
    'PRACTICE · 1 point each',
    'PRACTICE · 1 PT 1.',
    'What is a variable?',
    'PRACTICE · 1 PT 2.',
    'Which of these is a string literal: 42 or "42"? Explain.',
    'APPLY · 3 points each',
    'APPLY · 3 PTS 3.',
    'Write code that stores your favorite food in a variable and prints it in a sentence.',
    'CHALLENGE · 3 PTS 4.',
    'Why might a program crash if you add a number to a string? How would you fix it?',
  ].join('\n'),
  keyDoc: [
    'Practice (KEY) — String Literals and Variables',
    'PRACTICE · 1 PT 1.',
    'What is a variable?',
    'Answer: A named place in memory that stores a value the program can use or change.',
    'PRACTICE · 1 PT 2.',
    'Which of these is a string literal: 42 or "42"? Explain.',
    'Answer: "42" — it is in quotes, so it is text, not a number.',
    'APPLY · 3 PTS 3.',
    'Write code that stores your favorite food in a variable and prints it in a sentence.',
    'Answer: food = "tacos"  print("My favorite food is " + food)',
    'Full credit for any variable name, a string value in quotes, and a print that combines text with the variable.',
    'CHALLENGE · 3 PTS 4.',
    'Why might a program crash if you add a number to a string? How would you fix it?',
    'Answer: The types do not match. Convert the number to a string first, e.g. str(age).',
  ].join('\n'),

  // ---- Formative assessment (AI-generated, teacher edits before release) ----
  cfa: {
    phases: 'Phases 1–2 (sample)',
    lessonContext: 'Phase 1 Lesson 1 — What Is Computer Science?\nPhase 1 Lesson 4 — Binary\nPhase 2 Lesson 3 — Comments\nPhase 2 Lesson 5 — String Literals and Variables',
    prompt: 'You are writing a Common Formative Assessment (CFA) for a middle-school computer science class. This CFA covers Phases 1-2. First write a CONCISE study guide in markdown (under 400 words) summarizing the key concepts and vocabulary students should know across these phases. Then write 10 multiple-choice questions (exactly 4 choices each) that assess understanding spread evenly across ALL the phases. Questions must be clear, fair, and aligned to the lesson topics. Mark the single correct answer with answer_index (0-3). Return JSON with \'study_guide\' (string, markdown) and \'questions\' (array of {question: string, choices: [4 strings], answer_index: 0-3}).\n\nLessons in this phase range:\n{{lessonContext}}',
    response: {
      study_guide: '## Key ideas\n- **Computer science** is solving problems with computers.\n- **Binary** uses only 0 and 1.\n- **Comments** explain code and are ignored when it runs.\n- A **variable** stores a value; a **string literal** is text in quotes.',
      questions: [
        { question: 'What does binary use to represent data?', choices: ['0 and 1', 'Letters A–Z', 'Colors', 'Decimals'], answer_index: 0 },
        { question: 'Which line is a comment in Python?', choices: ['print("hi")', '# says hello', 'x = 5', '"hello"'], answer_index: 1 },
        { question: 'Which value is a string literal?', choices: ['42', 'True', '"42"', 'x'], answer_index: 2 },
        { question: 'What does a variable do?', choices: ['Deletes data', 'Stores a value', 'Turns off the computer', 'Draws a picture'], answer_index: 1 },
        { question: 'Which is NOT hardware?', choices: ['Keyboard', 'Monitor', 'Operating system', 'Mouse'], answer_index: 2, note: 'Topic from a lesson outside this range. A teacher would likely edit or delete it.' },
        { question: 'Pick the best answer about computer science.', choices: ['It is only about games', 'It is solving problems with computers', 'It is typing fast'], answer_index: 1, note: 'Only 3 choices. The code drops it automatically.' },
      ],
    },
  },

  // ---- Practice grading (AI vs. teacher model answers) ----
  gradingPrompt: 'You are grading 6th-grade student answers in a computer science practice worksheet. For EACH item, compare ONLY the CONTENT of the student_answer against the model_answer (which may include grading notes). Assess writing at a 6th-grade level: do NOT penalize simple wording, casual phrasing, or mild spelling/grammar as long as the core idea is present. Award partial credit when the idea is partly correct or incomplete. Score each item from 0 to its maxPoints. ALSO for each item include a \'confidence\' value from 0.0 to 1.0 expressing how sure you are the awarded score is correct — use low confidence when the student\'s answer is ambiguous, off-topic, or hard to compare to the model_answer. Return ONLY JSON shaped as: { "results": [{ "id": string, "score": number, "feedback": string, "confidence": number }], "total_score": number }. feedback should be one short sentence telling the student what was right or what was missing.\n\nItems to grade:\n{{items}}',
  submissions: [
    {
      student: 'Ava P. (sample)',
      answers: { practice1: 'its a name that holds a value', practice2: '"42" because its in quotes so its text', apply3: 'snack = "pizza"\nprint("I like " + snack)', challenge4: 'you cant add a number and words, use str() on the number' },
      ai: [
        { id: 'practice1', score: 1, feedback: 'Correct — a variable is a name that holds a value.', confidence: 0.97 },
        { id: 'practice2', score: 1, feedback: 'Right, the quotes make it text.', confidence: 0.98 },
        { id: 'apply3', score: 3, feedback: 'Stores a string and prints it in a sentence.', confidence: 0.95 },
        { id: 'challenge4', score: 3, feedback: 'You named the type mismatch and the str() fix.', confidence: 0.93 },
      ],
    },
    {
      student: 'Leo M. (sample)',
      answers: { practice1: 'a box', practice2: '42', apply3: 'print(food)', challenge4: 'because computers get confused' },
      ai: [
        { id: 'practice1', score: 0.5, feedback: 'A box is a start — say what goes in it.', confidence: 0.7 },
        { id: 'practice2', score: 0, feedback: 'The one in quotes is the string literal.', confidence: 0.95 },
        { id: 'apply3', score: 1, feedback: 'You printed, but the variable was never given a value.', confidence: 0.6 },
        { id: 'challenge4', score: 1, feedback: 'Say what does not match (the types) and how to convert.', confidence: 0.55 },
      ],
    },
  ],
};
