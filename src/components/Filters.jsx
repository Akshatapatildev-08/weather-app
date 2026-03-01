export default function Filters({ minTemp, condition, onMinTempChange, onConditionChange }) {
  return (
    <div className="glass filters">
      <label>
        Minimum Max Temp (C)
        <input
          type="number"
          value={Number.isFinite(minTemp) ? minTemp : ''}
          onChange={(e) => {
            const value = e.target.value;
            onMinTempChange(value === '' ? null : Number(value));
          }}
          placeholder="e.g. 20"
        />
      </label>
      <label>
        Condition Contains
        <input
          type="text"
          value={condition}
          onChange={(e) => onConditionChange(e.target.value)}
          placeholder="e.g. rain"
        />
      </label>
    </div>
  );
}