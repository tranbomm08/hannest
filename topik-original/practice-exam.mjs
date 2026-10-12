// A practice attempt uses the same official paper, questions and section time.
// Its separate ID keeps the existing full-exam answer sheet untouched.
export function officialExamId(exam) { return exam.sourceExamId ?? exam.id; }

export function createPracticeExam(original, phaseId) {
  if (original.level !== 'II' || original.practicePhase || !['listening','reading','writing'].includes(phaseId))
    throw new Error('Unsupported practice section');
  const phase = original.phases.find(p => p.id === phaseId);
  if (!phase) throw new Error('Missing official section');
  return {
    ...original,
    id: `${original.id}-practice-${phaseId}`,
    sourceExamId: original.id,
    practicePhase: phaseId,
    phases: [phase],
    // Listening retains every original track; playback skips only track 0.
    // Reading and writing start immediately and never load or play audio.
    tracks: phaseId === 'listening' ? original.tracks : [{url:null,seconds:0}],
    fullPapers: [phase.pdf],
  };
}
