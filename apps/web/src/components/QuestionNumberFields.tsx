export function nextQuestionNumbers(majorNumber: string, minorNumber: string) {
  const major = Number(majorNumber);
  const minor = Number(minorNumber);
  return {
    majorNumber: majorNumber.trim() && Number.isFinite(major) ? majorNumber : '',
    minorNumber: minorNumber.trim() && Number.isFinite(minor) ? String(minor + 1) : '',
  };
}

export function QuestionNumberFields({ majorNumber, minorNumber, onMajorNumberChange, onMinorNumberChange }: {
  majorNumber: string;
  minorNumber: string;
  onMajorNumberChange: (value: string) => void;
  onMinorNumberChange: (value: string) => void;
}) {
  return <div className="question-number-fields">
    <label><span>大题号</span><input type="number" min="1" step="1" value={majorNumber} onChange={(event) => onMajorNumberChange(event.target.value)} placeholder="如 1" /></label>
    <label><span>小题号</span><input type="number" min="1" step="1" value={minorNumber} onChange={(event) => onMinorNumberChange(event.target.value)} placeholder="如 2" /></label>
  </div>;
}
